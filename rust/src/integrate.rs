//! Euler integration - EXACT PORT of cytoscape-euler/src/euler/integrate.js
//!
//! Cross-reference: node_modules/cytoscape-euler/src/euler/integrate.js
//!
//! ```javascript
//! // use euler method for force integration http://en.wikipedia.org/wiki/Euler_method
//! // return sum of squared position deltas
//! function integrate( bodies, timeStep ){
//!   var dx = 0, tx = 0,
//!       dy = 0, ty = 0,
//!       i,
//!       max = bodies.length;
//!
//!   if (max === 0) { return 0; }
//!
//!   for (i = 0; i < max; ++i) {
//!     var body = bodies[i],
//!         coeff = timeStep / body.mass;
//!
//!     if( body.grabbed ){ continue; }
//!
//!     if( body.locked ){
//!       body.velocity.x = 0;
//!       body.velocity.y = 0;
//!     } else {
//!       body.velocity.x += coeff * body.force.x;
//!       body.velocity.y += coeff * body.force.y;
//!     }
//!
//!     var vx = body.velocity.x,
//!         vy = body.velocity.y,
//!         v = Math.sqrt(vx * vx + vy * vy);
//!
//!     if (v > 1) {
//!       body.velocity.x = vx / v;
//!       body.velocity.y = vy / v;
//!     }
//!
//!     dx = timeStep * body.velocity.x;
//!     dy = timeStep * body.velocity.y;
//!
//!     body.pos.x += dx;
//!     body.pos.y += dy;
//!
//!     tx += Math.abs(dx); ty += Math.abs(dy);
//!   }
//!
//!   return (tx * tx + ty * ty)/max;
//! }
//! ```

use crate::types::Body;

/// Euler method force integration
/// Returns sum of squared position deltas divided by body count
/// 
/// Cross-reference: node_modules/cytoscape-euler/src/euler/integrate.js lines 3-47
#[inline(always)]
pub fn integrate(bodies: &mut [Body], time_step: f32) -> f32 {
    // JS: var dx = 0, tx = 0, dy = 0, ty = 0
    let mut tx: f32 = 0.0;
    let mut ty: f32 = 0.0;
    
    // JS: max = bodies.length
    let max = bodies.len();
    
    // JS: if (max === 0) { return 0; }
    if max == 0 {
        return 0.0;
    }
    
    // JS: for (i = 0; i < max; ++i) {
    for body in bodies.iter_mut() {
        // JS: coeff = timeStep / body.mass
        debug_assert!(body.mass > 0.0, "Body mass must be positive, got {}", body.mass);
        let coeff = time_step / body.mass;
        
        // JS: if( body.grabbed ){ continue; }
        // Note: `grabbed` is always false in WASM — there is no drag interaction.
        // Kept for JS port fidelity; the branch is compiled away in release builds.
        if body.grabbed {
            continue;
        }
        
        // JS: if( body.locked ){
        //       body.velocity.x = 0;
        //       body.velocity.y = 0;
        //     } else {
        //       body.velocity.x += coeff * body.force.x;
        //       body.velocity.y += coeff * body.force.y;
        //     }
        if body.locked {
            body.velocity_x = 0.0;
            body.velocity_y = 0.0;
        } else {
            body.velocity_x += coeff * body.force_x;
            body.velocity_y += coeff * body.force_y;
        }
        
        // JS: var vx = body.velocity.x,
        //         vy = body.velocity.y,
        //         v = Math.sqrt(vx * vx + vy * vy);
        let vx = body.velocity_x;
        let vy = body.velocity_y;
        let v_sq = vx * vx + vy * vy;
        
        // JS: if (v > 1) { ... } - use v_sq > 1 to avoid sqrt when not needed
        if v_sq > 1.0 {
            // Only compute sqrt when we need to normalize
            let v_inv = 1.0 / v_sq.sqrt();
            body.velocity_x = vx * v_inv;
            body.velocity_y = vy * v_inv;
        }
        
        // JS: dx = timeStep * body.velocity.x;
        //     dy = timeStep * body.velocity.y;
        let dx = time_step * body.velocity_x;
        let dy = time_step * body.velocity_y;
        
        // JS: body.pos.x += dx;
        //     body.pos.y += dy;
        body.pos_x += dx;
        body.pos_y += dy;
        
        // JS: tx += Math.abs(dx); ty += Math.abs(dy);
        tx += dx.abs();
        ty += dy.abs();
    }
    
    // JS: return (tx * tx + ty * ty)/max;
    (tx * tx + ty * ty) / (max as f32)
}
