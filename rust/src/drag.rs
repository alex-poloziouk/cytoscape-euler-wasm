//! Drag force — SIMPLIFIED PORT of cytoscape-euler/src/euler/drag.js
//!
//! NOTE: This module is NOT used in production. The drag calculation is inlined
//! directly in `parallel.rs` for performance. This standalone version exists
//! solely so `tests.rs` can unit-test drag behavior in isolation.
//!
//! Simplification vs JS: the 3-level fallback (manualDragCoeff → body.dragCoeff
//! → defaultCoeff) is reduced to a single `manual_drag_coeff` parameter, since
//! WASM bodies have no per-body drag field.
//!
//! Cross-reference: node_modules/cytoscape-euler/src/euler/drag.js
//!
//! ```javascript
//! const defaultCoeff = 0.02;
//!
//! function applyDrag( body, manualDragCoeff ){
//!   let dragCoeff;
//!
//!   if( manualDragCoeff != null ){
//!     dragCoeff = manualDragCoeff;
//!   } else if( body.dragCoeff != null ){
//!     dragCoeff = body.dragCoeff;
//!   } else {
//!     dragCoeff = defaultCoeff;
//!   }
//!
//!   body.force.x -= dragCoeff * body.velocity.x;
//!   body.force.y -= dragCoeff * body.velocity.y;
//! }
//! ```

use crate::types::Body;

/// Apply drag force to body
/// 
/// Cross-reference: node_modules/cytoscape-euler/src/euler/drag.js lines 3-17
#[inline(always)]
pub fn apply_drag(body: &mut Body, manual_drag_coeff: f32) {
    // JS: dragCoeff = manualDragCoeff ?? body.dragCoeff ?? defaultCoeff
    // We use manual_drag_coeff directly (simplified - no per-body drag)
    let drag_coeff = manual_drag_coeff;
    
    // JS: body.force.x -= dragCoeff * body.velocity.x;
    //     body.force.y -= dragCoeff * body.velocity.y;
    body.force_x -= drag_coeff * body.velocity_x;
    body.force_y -= drag_coeff * body.velocity_y;
}
