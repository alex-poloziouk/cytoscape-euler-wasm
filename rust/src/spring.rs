//! Spring force - EXACT PORT of cytoscape-euler/src/euler/spring.js
//!
//! Cross-reference: node_modules/cytoscape-euler/src/euler/spring.js
//!
//! ```javascript
//! const defaults = Object.freeze({
//!   source: null,
//!   target: null,
//!   length: 80,
//!   coeff: 0.0002,
//!   weight: 1
//! });
//!
//! function applySpring( spring ){
//!   let body1 = spring.source,
//!       body2 = spring.target,
//!       length = spring.length < 0 ? defaults.length : spring.length,
//!       dx = body2.pos.x - body1.pos.x,
//!       dy = body2.pos.y - body1.pos.y,
//!       r = Math.sqrt(dx * dx + dy * dy);
//!
//!   if (r === 0) {
//!       dx = (Math.random() - 0.5) / 50;
//!       dy = (Math.random() - 0.5) / 50;
//!       r = Math.sqrt(dx * dx + dy * dy);
//!   }
//!
//!   let d = r - length;
//!   let coeff = ((!spring.coeff || spring.coeff < 0) ? defaults.coeff : spring.coeff) * d / r * spring.weight;
//!
//!   body1.force.x += coeff * dx;
//!   body1.force.y += coeff * dy;
//!
//!   body2.force.x -= coeff * dx;
//!   body2.force.y -= coeff * dy;
//! }
//! ```

use crate::types::{Body, Spring};
use crate::parallel::deterministic_jitter;

/// Default spring length
/// Cross-reference: node_modules/cytoscape-euler/src/euler/spring.js line 5
pub const DEFAULT_SPRING_LENGTH: f32 = 80.0;

/// Default spring coefficient
/// Cross-reference: node_modules/cytoscape-euler/src/euler/spring.js line 6
pub const DEFAULT_SPRING_COEFF: f32 = 0.0002;

/// Apply spring force between two bodies
/// 
/// Cross-reference: node_modules/cytoscape-euler/src/euler/spring.js lines 14-35
#[inline(always)]
pub fn apply_spring(spring: &Spring, bodies: &mut [Body]) {
    let source_idx = spring.source;
    let target_idx = spring.target;
    
    // Get positions first to avoid borrow issues
    let (mut dx, mut dy, mut r_sq) = {
        let body1 = &bodies[source_idx];
        let body2 = &bodies[target_idx];
        
        let dx = body2.pos_x - body1.pos_x;
        let dy = body2.pos_y - body1.pos_y;
        (dx, dy, dx * dx + dy * dy)
    };
    
    // JS: if (r === 0) { ... } - use r_sq < 1e-8 for robustness (matches parallel.rs)
    if r_sq < 1e-8 {
        dx = deterministic_jitter(source_idx, target_idx);
        dy = deterministic_jitter(target_idx, source_idx);
        r_sq = dx * dx + dy * dy;
        if r_sq < 1e-8 { r_sq = 1e-8; }
    }
    
    // Compute r and 1/r together
    let r = r_sq.sqrt();
    let r_inv = 1.0 / r;
    
    // JS: length = spring.length < 0 ? defaults.length : spring.length
    let length = if spring.length < 0.0 { DEFAULT_SPRING_LENGTH } else { spring.length };
    
    // JS: let d = r - length
    let d = r - length;
    
    // JS: let coeff = ... * d / r * spring.weight  ->  * d * r_inv * weight
    let spring_coeff = if spring.coeff <= 0.0 { DEFAULT_SPRING_COEFF } else { spring.coeff };
    let coeff = spring_coeff * d * r_inv * spring.weight;
    
    // Apply forces
    let force_x = coeff * dx;
    let force_y = coeff * dy;
    
    bodies[source_idx].force_x += force_x;
    bodies[source_idx].force_y += force_y;
    bodies[target_idx].force_x -= force_x;
    bodies[target_idx].force_y -= force_y;
}
