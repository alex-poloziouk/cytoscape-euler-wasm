//! Parallel force computation for multi-threaded WASM
//!
//! This module is the **sole code difference** between the standard and threaded
//! WASM builds. When the `parallel` Cargo feature is enabled, `compute_all_forces_parallel`
//! uses Rayon's `.par_iter()` for multi-core execution; otherwise it falls back to
//! sequential `.iter()`. The function body, algorithm, and math are identical —
//! one test suite covers both paths.
//!
//! Built via:
//!   Standard:  `wasm-pack build --target web --release`
//!   Threaded:  `wasm-pack build --target web --release -- --features parallel`

use crate::types::Body;
use crate::quadtree::Quadtree;

#[cfg(feature = "parallel")]
use rayon::prelude::*;

/// Force result for a single body (computed independently)
#[derive(Clone, Copy, Default)]
pub struct BodyForce {
    pub force_x: f32,
    pub force_y: f32,
}

/// Compute forces for all bodies in parallel
/// 
/// This is the hot path that benefits most from parallelization.
/// Each body's force can be computed independently given a read-only quadtree.
#[cfg(feature = "parallel")]
pub fn compute_all_forces_parallel(
    bodies: &[Body],
    quadtree: &Quadtree,
    gravity: f32,
    theta: f32,
    pull: f32,
    drag_coeff: f32,
) -> Vec<BodyForce> {
    bodies
        .par_iter()
        .enumerate()
        .map(|(i, body)| {
            let (mut fx, mut fy) = compute_body_force_readonly(
                i, body, bodies, quadtree, gravity, theta, pull
            );
            // Apply drag (simple calculation)
            fx -= drag_coeff * body.velocity_x;
            fy -= drag_coeff * body.velocity_y;
            BodyForce { force_x: fx, force_y: fy }
        })
        .collect()
}

/// Sequential fallback when parallel feature is not enabled
#[cfg(not(feature = "parallel"))]
pub fn compute_all_forces_parallel(
    bodies: &[Body],
    quadtree: &Quadtree,
    gravity: f32,
    theta: f32,
    pull: f32,
    drag_coeff: f32,
) -> Vec<BodyForce> {
    bodies
        .iter()
        .enumerate()
        .map(|(i, body)| {
            let (mut fx, mut fy) = compute_body_force_readonly(
                i, body, bodies, quadtree, gravity, theta, pull
            );
            fx -= drag_coeff * body.velocity_x;
            fy -= drag_coeff * body.velocity_y;
            BodyForce { force_x: fx, force_y: fy }
        })
        .collect()
}

/// Compute force for a single body using read-only access to quadtree
/// 
/// This is thread-safe because it only reads from the quadtree and bodies.
/// Optimized with fast inverse sqrt and reduced branching.
#[inline(always)]
fn compute_body_force_readonly(
    body_idx: usize,
    body: &Body,
    bodies: &[Body],
    quadtree: &Quadtree,
    gravity: f32,
    theta: f32,
    pull: f32,
) -> (f32, f32) {
    let source_x = body.pos_x;
    let source_y = body.pos_y;
    let source_mass = body.mass;
    
    let theta_sq = theta * theta;
    
    let mut fx: f32 = 0.0;
    let mut fy: f32 = 0.0;
    
    // Pull toward origin (simplified - skip if pull is negligible)
    if pull.abs() > 1e-8 {
        let px = -source_x;
        let py = -source_y;
        let pr_sq = px * px + py * py;
        if pr_sq > 1e-8 {
            let pr_inv = fast_inv_sqrt(pr_sq);
            let pv = source_mass * pull * pr_inv;
            fx += pv * px;
            fy += pv * py;
        }
    }
    
    // DFS stack — thread-local, pre-allocated with typical n-body tree depth
    let mut stack = Vec::with_capacity(64);
    stack.push(0usize);
    
    while let Some(node_idx) = stack.pop() {
        let node = quadtree.get_node(node_idx);
        
        if let Some(other_body_idx) = node.body {
            if other_body_idx != body_idx {
                let other = &bodies[other_body_idx];
                let mut dx = other.pos_x - source_x;
                let mut dy = other.pos_y - source_y;
                let mut r_sq = dx * dx + dy * dy;
                
                if r_sq < 1e-8 {
                    // Deterministic jitter based on indices
                    dx = deterministic_jitter(body_idx, other_body_idx);
                    dy = deterministic_jitter(body_idx + 1000, other_body_idx);
                    r_sq = dx * dx + dy * dy;
                    if r_sq < 1e-8 { r_sq = 1e-8; }
                }
                
                // Fast inverse sqrt: 1/sqrt(r_sq)
                let r_inv = fast_inv_sqrt(r_sq);
                // v = gravity * m1 * m2 / r^3 = gravity * m1 * m2 * r_inv^3
                let r_inv3 = r_inv * r_inv * r_inv;
                let v = gravity * other.mass * source_mass * r_inv3;
                fx += v * dx;
                fy += v * dy;
            }
        } else if node.mass > 0.0 {
            let mass_inv = 1.0 / node.mass;
            let mut dx = node.mass_x * mass_inv - source_x;
            let mut dy = node.mass_y * mass_inv - source_y;
            let mut r_sq = dx * dx + dy * dy;
            
            if r_sq < 1e-8 {
                dx = deterministic_jitter(body_idx, node_idx);
                dy = deterministic_jitter(body_idx + 2000, node_idx);
                r_sq = dx * dx + dy * dy;
                if r_sq < 1e-8 { r_sq = 1e-8; }
            }
            
            let width = node.right - node.left;
            let width_sq = width * width;
            
            if width_sq < theta_sq * r_sq {
                // Barnes-Hut approximation: treat node as single body
                let r_inv = fast_inv_sqrt(r_sq);
                let r_inv3 = r_inv * r_inv * r_inv;
                let v = gravity * node.mass * source_mass * r_inv3;
                fx += v * dx;
                fy += v * dy;
            } else {
                // Recurse into children
                if let Some(q) = node.quad0 { stack.push(q); }
                if let Some(q) = node.quad1 { stack.push(q); }
                if let Some(q) = node.quad2 { stack.push(q); }
                if let Some(q) = node.quad3 { stack.push(q); }
            }
        }
    }
    
    (fx, fy)
}

/// Deterministic jitter that doesn't require mutable state.
/// Thread-safe alternative to random jitter — used by both gravity (parallel.rs)
/// and spring (spring.rs) force calculations.
#[inline(always)]
pub(crate) fn deterministic_jitter(a: usize, b: usize) -> f32 {
    // Use a simple hash-like function for deterministic but varied jitter
    let mut x = (a as u32).wrapping_mul(0x9E3779B9);
    x = x.wrapping_add((b as u32).wrapping_mul(0x85EBCA6B));
    x ^= x >> 16;
    x = x.wrapping_mul(0x85EBCA6B);
    x ^= x >> 13;
    // Map to small range [-0.01, 0.01]
    const SCALE: f32 = 0.02 / (u32::MAX as f32);
    (x as f32) * SCALE - 0.01
}

/// Fast inverse square root (Quake III style)
/// Returns an approximation of 1/sqrt(x) with ~1% accuracy
/// This is the main performance optimization for n-body simulation
#[inline(always)]
fn fast_inv_sqrt(x: f32) -> f32 {
    // Initial approximation using bit manipulation (famous Quake trick)
    let i = x.to_bits();
    let i = 0x5f375a86 - (i >> 1);  // Magic constant for f32
    let y = f32::from_bits(i);
    
    // One Newton-Raphson iteration for better accuracy
    // y = y * (1.5 - 0.5 * x * y * y)
    let half_x = 0.5 * x;
    y * (1.5 - half_x * y * y)
}

/// Apply computed forces back to bodies
pub fn apply_forces_to_bodies(bodies: &mut [Body], forces: &[BodyForce]) {
    for (body, force) in bodies.iter_mut().zip(forces.iter()) {
        body.force_x = force.force_x;
        body.force_y = force.force_y;
    }
}
