//! Main tick function — port of cytoscape-euler/src/euler/tick.js
//!
//! Same Barnes-Hut algorithm as JS, with added parallelism and fast math.
//!
//! Cross-reference: node_modules/cytoscape-euler/src/euler/tick.js
//!
//! ```javascript
//! function tick({ bodies, springs, quadtree, timeStep, gravity, theta, dragCoeff, pull }){
//!   quadtree.insertBodies( bodies );
//!   for( let i = 0; i < bodies.length; i++ ){
//!     let body = bodies[i];
//!     quadtree.updateBodyForce( body, gravity, theta, pull );
//!     applyDrag( body, dragCoeff );
//!   }
//!   for( let i = 0; i < springs.length; i++ ){
//!     applySpring( spring );
//!   }
//!   let movement = integrate( bodies, timeStep );
//!   return movement;
//! }
//! ```

use crate::integrate::integrate;
use crate::quadtree::Quadtree;
use crate::spring::apply_spring;
use crate::types::{Body, Spring};
use crate::parallel::{compute_all_forces_parallel, apply_forces_to_bodies};

/// One simulation tick — equivalent to tick.js tick() (same physics, parallelized forces)
/// 
/// Cross-reference: node_modules/cytoscape-euler/src/euler/tick.js lines 5-45
/// 
/// Uses parallel force computation when the `parallel` feature is enabled.
pub fn tick(
    bodies: &mut [Body],
    springs: &[Spring],
    quadtree: &mut Quadtree,
    time_step: f32,
    gravity: f32,
    theta: f32,
    drag_coeff: f32,
    pull: f32,
) -> f32 {
    // JS: quadtree.insertBodies( bodies );
    quadtree.insert_bodies(bodies);
    
    // Parallel force computation (when enabled) or sequential fallback
    // Barnes-Hut: O(n log n) total per tick (each of n bodies traverses O(log n) tree)
    let forces = compute_all_forces_parallel(
        bodies, quadtree, gravity, theta, pull, drag_coeff
    );
    apply_forces_to_bodies(bodies, &forces);
    
    // JS: for( let i = 0; i < springs.length; i++ ){
    //       applySpring( spring );
    //     }
    for spring in springs {
        apply_spring(spring, bodies);
    }
    
    // JS: let movement = integrate( bodies, timeStep );
    // JS: return movement;
    integrate(bodies, time_step)
}
