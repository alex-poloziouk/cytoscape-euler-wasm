//! Core data types - EXACT PORT of cytoscape-euler data structures
//!
//! Cross-references:
//! - node_modules/cytoscape-euler/src/euler/body.js
//! - node_modules/cytoscape-euler/src/euler/spring.js
//! - node_modules/cytoscape-euler/src/euler/defaults.js

use serde::{Deserialize, Serialize};

/// Body (node) in the physics simulation
/// 
/// Cross-reference: node_modules/cytoscape-euler/src/euler/body.js
/// ```javascript
/// const defaults = Object.freeze({
///   pos: { x: 0, y: 0 },
///   prevPos: { x: 0, y: 0 },
///   force: { x: 0, y: 0 },
///   velocity: { x: 0, y: 0 },
///   mass: 1
/// });
/// ```
#[derive(Clone, Debug)]
pub struct Body {
    /// Position X - matches body.pos.x
    pub pos_x: f32,
    /// Position Y - matches body.pos.y
    pub pos_y: f32,
    /// Force X - matches body.force.x
    pub force_x: f32,
    /// Force Y - matches body.force.y
    pub force_y: f32,
    /// Velocity X - matches body.velocity.x
    pub velocity_x: f32,
    /// Velocity Y - matches body.velocity.y
    pub velocity_y: f32,
    /// Mass - matches body.mass
    pub mass: f32,
    /// Locked - matches body.locked
    pub locked: bool,
    /// Grabbed - matches body.grabbed (for drag interaction)
    pub grabbed: bool,
    /// Original node ID for mapping back to cytoscape
    pub id: String,
}

impl Body {
    /// Create a new body with default values
    /// Cross-reference: node_modules/cytoscape-euler/src/euler/body.js makeBody()
    pub fn new(id: String, pos_x: f32, pos_y: f32, mass: f32, locked: bool) -> Self {
        Self {
            pos_x,
            pos_y,
            force_x: 0.0,
            force_y: 0.0,
            velocity_x: 0.0,
            velocity_y: 0.0,
            mass,
            locked,
            grabbed: false,
            id,
        }
    }
}

/// Spring (edge) connecting two bodies
///
/// Cross-reference: node_modules/cytoscape-euler/src/euler/spring.js
/// ```javascript
/// const defaults = Object.freeze({
///   source: null,
///   target: null,
///   length: 80,
///   coeff: 0.0002,
///   weight: 1
/// });
/// ```
#[derive(Clone, Debug)]
pub struct Spring {
    /// Source body index
    pub source: usize,
    /// Target body index
    pub target: usize,
    /// Ideal spring length - matches spring.length
    pub length: f32,
    /// Spring coefficient - matches spring.coeff
    pub coeff: f32,
    /// Spring weight - matches spring.weight
    pub weight: f32,
}

impl Spring {
    pub fn new(source: usize, target: usize, length: f32, coeff: f32) -> Self {
        Self {
            source,
            target,
            length,
            coeff,
            weight: 1.0,
        }
    }
}

/// Layout configuration matching cytoscape-euler defaults
///
/// Cross-reference: node_modules/cytoscape-euler/src/euler/defaults.js
/// ```javascript
/// const defaults = Object.freeze({
///   springLength: edge => 80,
///   springCoeff: edge => 0.0008,
///   mass: node => 4,
///   gravity: -1.2,
///   pull: 0.001,
///   theta: 0.666,
///   dragCoeff: 0.02,
///   movementThreshold: 1,
///   timeStep: 20
/// });
/// ```
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LayoutConfig {
    /// Ideal spring length - defaults.springLength
    pub spring_length: f32,
    /// Spring coefficient - defaults.springCoeff
    pub spring_coeff: f32,
    /// Node mass - defaults.mass
    pub mass: f32,
    /// Gravity (negative = repulsion) - defaults.gravity
    pub gravity: f32,
    /// Pull toward origin - defaults.pull
    pub pull: f32,
    /// Barnes-Hut theta - defaults.theta
    pub theta: f32,
    /// Drag coefficient - defaults.dragCoeff
    pub drag_coeff: f32,
    /// Movement threshold for convergence - defaults.movementThreshold
    pub movement_threshold: f32,
    /// Time step per iteration - defaults.timeStep
    pub time_step: f32,
    /// Maximum iterations
    pub max_iterations: u32,
    /// Maximum simulation time in milliseconds - defaults.maxSimulationTime
    pub max_simulation_time: f64,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        // Values from cytoscape-euler/src/euler/defaults.js
        // These are fallbacks — in practice toRustConfig() in TS always fills all fields.
        // max_iterations and max_simulation_time are set higher than JS defaults
        // to allow large graphs to complete.
        Self {
            spring_length: 80.0,
            spring_coeff: 0.0008,
            mass: 4.0,
            gravity: -1.2,
            pull: 0.001,
            theta: 0.666,
            drag_coeff: 0.02,
            movement_threshold: 1.0,
            time_step: 20.0,
            max_iterations: 2000,  // Higher than JS default (1000) — large graph safety net
            max_simulation_time: 30000.0, // Higher than JS default (4s) — large graph safety net
        }
    }
}

/// Result of running the layout
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LayoutResult {
    pub positions: Vec<NodePosition>,
    pub iterations: u32,
    pub converged: bool,
    pub time_ms: f64,
}

/// Final position of a node
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NodePosition {
    pub id: String,
    pub x: f32,
    pub y: f32,
}
