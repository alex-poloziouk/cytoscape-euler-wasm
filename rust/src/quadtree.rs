//! Barnes-Hut Quadtree — tree construction & insertion.
//!
//! Based on cytoscape-euler/src/euler/quadtree/index.js (insertion logic only;
//! force computation now lives in `parallel::compute_body_force_readonly`).
//!
//! References:
//! - http://www.eecs.berkeley.edu/~demmel/cs267/lecture26/lecture26.html
//! - http://en.wikipedia.org/wiki/Barnes%E2%80%93Hut_simulation

use crate::types::Body;

/// Quadtree node - matches node_modules/cytoscape-euler/src/euler/quadtree/node.js
#[derive(Clone)]
pub struct QuadNode {
    pub left: f32,
    pub right: f32,
    pub top: f32,
    pub bottom: f32,
    pub mass: f32,
    pub mass_x: f32,
    pub mass_y: f32,
    pub body: Option<usize>,  // Index into bodies array
    pub quad0: Option<usize>, // Index into nodes array
    pub quad1: Option<usize>,
    pub quad2: Option<usize>,
    pub quad3: Option<usize>,
}

impl QuadNode {
    fn new() -> Self {
        Self {
            left: 0.0,
            right: 0.0,
            top: 0.0,
            bottom: 0.0,
            mass: 0.0,
            mass_x: 0.0,
            mass_y: 0.0,
            body: None,
            quad0: None,
            quad1: None,
            quad2: None,
            quad3: None,
        }
    }
    
    fn reset(&mut self) {
        self.left = 0.0;
        self.right = 0.0;
        self.top = 0.0;
        self.bottom = 0.0;
        self.mass = 0.0;
        self.mass_x = 0.0;
        self.mass_y = 0.0;
        self.body = None;
        self.quad0 = None;
        self.quad1 = None;
        self.quad2 = None;
        self.quad3 = None;
    }
}

/// Insert stack item for non-recursive insertion
struct InsertStackItem {
    node_idx: usize,
    body_idx: usize,
}

/// Barnes-Hut Quadtree
/// Cross-reference: node_modules/cytoscape-euler/src/euler/quadtree/index.js
pub struct Quadtree {
    nodes: Vec<QuadNode>,
    current_in_cache: usize,
    insert_stack: Vec<InsertStackItem>,
}

// SAFETY: Quadtree is shared read-only across threads in parallel force computation.
// After `insert_bodies()` completes, only `get_node()` (immutable) is called.
unsafe impl Sync for Quadtree {}

impl Quadtree {
    pub fn new() -> Self {
        let mut nodes = Vec::with_capacity(4096);
        nodes.push(QuadNode::new());
        Self {
            nodes,
            current_in_cache: 1,
            insert_stack: Vec::with_capacity(256),
        }
    }
    
    /// Get read-only access to a node (for parallel force computation)
    #[inline(always)]
    pub fn get_node(&self, idx: usize) -> &QuadNode {
        &self.nodes[idx]
    }
    
    /// Allocate or reuse a node
    /// Cross-reference: node_modules/cytoscape-euler/src/euler/quadtree/index.js lines 23-40
    fn new_node(&mut self) -> usize {
        let idx = self.current_in_cache;
        if idx >= self.nodes.len() {
            self.nodes.push(QuadNode::new());
        } else {
            self.nodes[idx].reset();
        }
        self.current_in_cache += 1;
        idx
    }
    
    /// Insert all bodies into the quadtree
    /// Cross-reference: node_modules/cytoscape-euler/src/euler/quadtree/index.js lines 139-188
    pub fn insert_bodies(&mut self, bodies: &[Body]) {
        if bodies.is_empty() {
            return;
        }
        
        // JS: let x1 = Number.MAX_VALUE, y1 = Number.MAX_VALUE,
        //         x2 = Number.MIN_VALUE, y2 = Number.MIN_VALUE
        let mut x1 = f32::MAX;
        let mut y1 = f32::MAX;
        let mut x2 = f32::MIN;
        let mut y2 = f32::MIN;
        
        // JS: while (i--) { ... find bounding box ... }
        for body in bodies.iter() {
            let x = body.pos_x;
            let y = body.pos_y;
            if x < x1 { x1 = x; }
            if x > x2 { x2 = x; }
            if y < y1 { y1 = y; }
            if y > y2 { y2 = y; }
        }
        
        // JS: Squarify the bounds
        let dx = x2 - x1;
        let dy = y2 - y1;
        if dx > dy {
            y2 = y1 + dx;
        } else {
            x2 = x1 + dy;
        }
        
        // JS: currentInCache = 0; root = newNode();
        self.current_in_cache = 0;
        let root_idx = self.new_node();
        self.nodes[root_idx].left = x1;
        self.nodes[root_idx].right = x2;
        self.nodes[root_idx].top = y1;
        self.nodes[root_idx].bottom = y2;
        
        // JS: root.body = bodies[i] for first body
        let max = bodies.len();
        if max > 0 {
            self.nodes[root_idx].body = Some(max - 1);
        }
        
        // JS: while (i--) { insert(bodies[i], root); }
        for i in (0..max - 1).rev() {
            self.insert(i, bodies);
        }
    }
    
    /// Insert a single body
    /// Cross-reference: node_modules/cytoscape-euler/src/euler/quadtree/index.js lines 190-268
    fn insert(&mut self, body_idx: usize, bodies: &[Body]) {
        self.insert_stack.clear();
        self.insert_stack.push(InsertStackItem { node_idx: 0, body_idx });
        
        while let Some(item) = self.insert_stack.pop() {
            let node_idx = item.node_idx;
            let body_idx = item.body_idx;
            let body = &bodies[body_idx];
            
            if self.nodes[node_idx].body.is_none() {
                // Internal node - update mass and recurse
                let x = body.pos_x;
                let y = body.pos_y;
                
                self.nodes[node_idx].mass += body.mass;
                self.nodes[node_idx].mass_x += body.mass * x;
                self.nodes[node_idx].mass_y += body.mass * y;
                
                // Find quadrant
                let left = self.nodes[node_idx].left;
                let right = (self.nodes[node_idx].right + left) / 2.0;
                let top = self.nodes[node_idx].top;
                let bottom = (self.nodes[node_idx].bottom + top) / 2.0;
                
                let mut quad_idx = 0;
                let mut new_left = left;
                let mut new_right = right;
                let mut new_top = top;
                let mut new_bottom = bottom;
                
                if x > right {
                    quad_idx += 1;
                    new_left = right;
                    new_right = self.nodes[node_idx].right;
                }
                if y > bottom {
                    quad_idx += 2;
                    new_top = bottom;
                    new_bottom = self.nodes[node_idx].bottom;
                }
                
                let child_idx = self.get_child(node_idx, quad_idx);
                if let Some(child) = child_idx {
                    // Continue into child
                    self.insert_stack.push(InsertStackItem { node_idx: child, body_idx });
                } else {
                    // Create new child
                    let new_child = self.new_node();
                    self.nodes[new_child].left = new_left;
                    self.nodes[new_child].right = new_right;
                    self.nodes[new_child].top = new_top;
                    self.nodes[new_child].bottom = new_bottom;
                    self.nodes[new_child].body = Some(body_idx);
                    self.set_child(node_idx, quad_idx, new_child);
                }
            } else {
                // Leaf node - convert to internal
                let old_body_idx = self.nodes[node_idx].body.unwrap();
                self.nodes[node_idx].body = None;
                
                // Check for same position
                let old_body = &bodies[old_body_idx];
                let new_body = &bodies[body_idx];
                
                if is_same_position(old_body.pos_x, old_body.pos_y, new_body.pos_x, new_body.pos_y) {
                    // Same position - skip to avoid infinite loop
                    continue;
                }
                
                // Re-insert both
                self.insert_stack.push(InsertStackItem { node_idx, body_idx: old_body_idx });
                self.insert_stack.push(InsertStackItem { node_idx, body_idx });
            }
        }
    }
    
    fn get_child(&self, node_idx: usize, quad: usize) -> Option<usize> {
        match quad {
            0 => self.nodes[node_idx].quad0,
            1 => self.nodes[node_idx].quad1,
            2 => self.nodes[node_idx].quad2,
            _ => self.nodes[node_idx].quad3,
        }
    }
    
    fn set_child(&mut self, node_idx: usize, quad: usize, child: usize) {
        match quad {
            0 => self.nodes[node_idx].quad0 = Some(child),
            1 => self.nodes[node_idx].quad1 = Some(child),
            2 => self.nodes[node_idx].quad2 = Some(child),
            _ => self.nodes[node_idx].quad3 = Some(child),
        }
    }
}

impl Default for Quadtree {
    fn default() -> Self {
        Self::new()
    }
}

/// Check if two positions are the same (within threshold)
/// Cross-reference: node_modules/cytoscape-euler/src/euler/quadtree/index.js lines 10-15
#[inline(always)]
fn is_same_position(x1: f32, y1: f32, x2: f32, y2: f32) -> bool {
    // Keep exact JS behavior: check each axis independently
    const THRESHOLD: f32 = 1e-8;
    let dx = x1 - x2;
    let dy = y1 - y2;
    dx.abs() < THRESHOLD && dy.abs() < THRESHOLD
}
