//! WASM Euler Layout — port of cytoscape-euler to Rust/WASM
//!
//! Same Barnes-Hut O(n log n) algorithm as cytoscape-euler. The speedup comes
//! from native WASM execution, Rayon multi-threading, and fast math optimizations.
//!
//! ## Builds
//!
//! The same source compiles to two WASM binaries:
//! - **Standard** (`wasm-pack build`) — sequential `.iter()`, any browser
//! - **Threaded** (`--features parallel`) — Rayon `.par_iter()`, requires SharedArrayBuffer
//!
//! The `parallel` feature flag is the **sole** code difference (see `parallel.rs`).
//!
//! ## Cross-references
//!
//! - node_modules/cytoscape-euler/src/euler/index.js
//! - node_modules/cytoscape-euler/src/euler/simulator.js
//! - node_modules/cytoscape-euler/src/euler/tick.js
//! - node_modules/cytoscape-euler/src/euler/defaults.js

use wasm_bindgen::prelude::*;
use serde::Deserialize;
use js_sys::Function;

mod types;
mod quadtree;
mod tick;
mod integrate;
mod drag; // Test-only: production drag is inlined in parallel.rs
mod spring;
mod parallel;

#[cfg(feature = "parallel")]
pub use wasm_bindgen_rayon::init_thread_pool;

#[cfg(test)]
mod tests;

pub use types::{Body, Spring, LayoutConfig, LayoutResult, NodePosition};

/// Input node from JavaScript
#[derive(Clone, Debug, Deserialize)]
pub struct NodeInput {
    pub id: String,
    pub x: f32,
    pub y: f32,
    #[serde(default)]
    pub mass: Option<f32>,
    #[serde(default)]
    pub locked: Option<bool>,
}

/// Input edge from JavaScript
#[derive(Clone, Debug, Deserialize)]
pub struct EdgeInput {
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub length: Option<f32>,
}

/// Configuration from JavaScript
#[derive(Clone, Debug, Default, Deserialize)]
pub struct ConfigInput {
    #[serde(default)]
    pub spring_length: Option<f32>,
    #[serde(default)]
    pub spring_coeff: Option<f32>,
    #[serde(default)]
    pub mass: Option<f32>,
    #[serde(default)]
    pub gravity: Option<f32>,
    #[serde(default)]
    pub pull: Option<f32>,
    #[serde(default)]
    pub theta: Option<f32>,
    #[serde(default)]
    pub drag_coeff: Option<f32>,
    #[serde(default)]
    pub movement_threshold: Option<f32>,
    #[serde(default)]
    pub time_step: Option<f32>,
    #[serde(default)]
    pub max_iterations: Option<u32>,
    #[serde(default)]
    pub max_simulation_time: Option<f64>,
}

impl ConfigInput {
    fn to_config(&self) -> LayoutConfig {
        let defaults = LayoutConfig::default();
        LayoutConfig {
            spring_length: self.spring_length.unwrap_or(defaults.spring_length),
            spring_coeff: self.spring_coeff.unwrap_or(defaults.spring_coeff),
            mass: self.mass.unwrap_or(defaults.mass),
            gravity: self.gravity.unwrap_or(defaults.gravity),
            pull: self.pull.unwrap_or(defaults.pull),
            theta: self.theta.unwrap_or(defaults.theta),
            drag_coeff: self.drag_coeff.unwrap_or(defaults.drag_coeff),
            movement_threshold: self.movement_threshold.unwrap_or(defaults.movement_threshold),
            time_step: self.time_step.unwrap_or(defaults.time_step),
            max_iterations: self.max_iterations.unwrap_or(defaults.max_iterations),
            max_simulation_time: self.max_simulation_time.unwrap_or(defaults.max_simulation_time),
        }
    }
}

/// Run the euler layout simulation
///
/// This is the main entry point, matching the behavior of:
/// node_modules/cytoscape-euler/src/euler/simulator.js step()
///
/// The simulation loop runs until either:
/// 1. Maximum iterations reached
/// 2. Movement falls below threshold (converged)
///
/// The optional `progress_callback` is called every ~50 iterations with
/// (progressPercent, currentIteration, elapsedMs) so JS can display
/// accurate iteration-based progress. The percent is calculated here
/// as max(iterProgress, timeProgress) capped at 99.
#[wasm_bindgen]
pub fn run_euler_layout(
    nodes_js: JsValue,
    edges_js: JsValue,
    config_js: JsValue,
    progress_callback: Option<Function>,
) -> Result<JsValue, JsValue> {
    // Parse inputs
    let nodes: Vec<NodeInput> = serde_wasm_bindgen::from_value(nodes_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse nodes: {}", e)))?;
    
    let edges: Vec<EdgeInput> = serde_wasm_bindgen::from_value(edges_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse edges: {}", e)))?;
    
    let config_input: ConfigInput = serde_wasm_bindgen::from_value(config_js)
        .unwrap_or_default();
    
    let config = config_input.to_config();
    
    // Build node ID to index mapping
    let mut id_to_index: std::collections::HashMap<String, usize> = 
        std::collections::HashMap::with_capacity(nodes.len());
    
    // Create bodies from nodes
    // Cross-reference: node_modules/cytoscape-euler/src/euler/index.js makeBodies()
    let mut bodies: Vec<Body> = Vec::with_capacity(nodes.len());
    for (i, node) in nodes.iter().enumerate() {
        id_to_index.insert(node.id.clone(), i);
        bodies.push(Body::new(
            node.id.clone(),
            node.x,
            node.y,
            node.mass.unwrap_or(config.mass),
            node.locked.unwrap_or(false),
        ));
    }
    
    // Create springs from edges
    // Cross-reference: node_modules/cytoscape-euler/src/euler/index.js makeSprings()
    let mut springs: Vec<Spring> = Vec::with_capacity(edges.len());
    for edge in edges.iter() {
        if let (Some(&source_idx), Some(&target_idx)) = 
            (id_to_index.get(&edge.source), id_to_index.get(&edge.target)) 
        {
            springs.push(Spring::new(
                source_idx,
                target_idx,
                edge.length.unwrap_or(config.spring_length),
                config.spring_coeff,
            ));
        }
    }
    
    // Create quadtree for Barnes-Hut optimization
    let mut qt = quadtree::Quadtree::new();
    
    // Run simulation
    // Cross-reference: node_modules/cytoscape-euler/src/euler/simulator.js step()
    // Cross-reference: node_modules/cytoscape-euler/src/layout/tick.js isDone()
    let start_time = instant::Instant::now();
    let mut iterations = 0u32;
    let mut converged = false;
    let max_time_ms = config.max_simulation_time;
    
    // === OPTIMIZATION: Adaptive theta ===
    // Start with larger theta (faster but less accurate) and refine as simulation stabilizes
    // This provides 10-20% speedup by doing less work in early chaotic iterations
    let base_theta = config.theta;
    let max_theta = (base_theta * 1.5).min(1.2);  // Cap at 1.2 for reasonable accuracy
    
    // NOTE: Stall detection disabled - was causing premature exit and overlapping nodes
    // The standard convergence check (movement <= threshold) is sufficient
    
    // Progress reporting interval (every 50 iterations to avoid call overhead)
    const PROGRESS_INTERVAL: u32 = 50;
    
    for iter in 0..config.max_iterations {
        iterations = iter + 1;
        
        // Adaptive theta: start high, decrease as simulation progresses
        // After 20% of max iterations, use base theta
        let progress = iter as f32 / config.max_iterations as f32;
        let current_theta = if progress < 0.2 {
            // Linear interpolation from max_theta to base_theta
            max_theta - (max_theta - base_theta) * (progress / 0.2)
        } else {
            base_theta
        };
        
        // Run one tick of the simulation
        // Cross-reference: node_modules/cytoscape-euler/src/euler/tick.js
        let movement = tick::tick(
            &mut bodies,
            &springs,
            &mut qt,
            config.time_step,
            config.gravity,
            current_theta,
            config.drag_coeff,
            config.pull,
        );
        
        // Check for convergence
        // Cross-reference: node_modules/cytoscape-euler/src/euler/simulator.js
        // "if( movement <= movementThreshold ) settled"
        if movement <= config.movement_threshold {
            converged = true;
            break;
        }
        
        // Check time limit (like JS maxSimulationTime)
        // Cross-reference: node_modules/cytoscape-euler/src/layout/tick.js line 20
        let elapsed_ms = start_time.elapsed().as_secs_f64() * 1000.0;
        if elapsed_ms >= max_time_ms {
            break;
        }
        
        // Report progress to JS every PROGRESS_INTERVAL iterations
        if let Some(ref cb) = progress_callback {
            if iterations % PROGRESS_INTERVAL == 0 {
                // Calculate progress as max of iteration-based and time-based,
                // capped at 99% (100% only when truly complete)
                let iter_progress = (iterations as f64 / config.max_iterations as f64) * 100.0;
                let time_progress = (elapsed_ms / max_time_ms) * 100.0;
                let percent = iter_progress.max(time_progress).min(99.0).round() as u32;
                let _ = cb.call3(
                    &JsValue::NULL,
                    &JsValue::from(percent),
                    &JsValue::from(iterations),
                    &JsValue::from(elapsed_ms),
                );
            }
        }
    }
    
    let elapsed = start_time.elapsed();
    let time_ms = elapsed.as_secs_f64() * 1000.0;
    
    // Build result
    let positions: Vec<NodePosition> = bodies
        .iter()
        .map(|body| NodePosition {
            id: body.id.clone(),
            x: body.pos_x,
            y: body.pos_y,
        })
        .collect();
    
    let result = LayoutResult {
        positions,
        iterations,
        converged,
        time_ms,
    };
    
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}
