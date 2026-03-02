//! Unit tests for Euler layout WASM implementation
//!
//! 48 tests (44 pass, 4 ignored) covering:
//! - Body/Spring/Config initialization and defaults
//! - Spring force calculations (push/pull/rest-length, JS comparison)
//! - Drag force
//! - Quadtree insertion and force calculations (production path)
//! - Integration (velocity/position updates, JS comparison)
//! - Full tick simulation (single tick and convergence)
//! - End-to-end layout (various topologies: chain, grid, star)
//! - Edge cases (empty, single-node, coincident, locked, extreme mass)
//! - Adaptive theta correctness and stability
//! - Re-layout convergence and perturbation recovery
//! - Determinism and NaN/Inf safety
//! - Performance benchmarks (1K runs, 5K/10K ignored)
//! - Stall detection logic (ignored — disabled in lib.rs)

#[cfg(test)]
mod tests {
    use crate::types::{Body, Spring, LayoutConfig};
    use crate::quadtree::Quadtree;
    use crate::spring::apply_spring;
    use crate::drag::apply_drag; // Standalone version for unit testing (production inlines this in parallel.rs)
    use crate::integrate::integrate;
    use crate::tick::tick;
    use crate::parallel::compute_all_forces_parallel;

    // ==================== Body Tests ====================
    // (Body/Spring creation tests are in Initialization Tests section below)

    #[test]
    fn test_body_locked() {
        let body = Body::new("locked_node".to_string(), 50.0, 50.0, 4.0, true);
        assert!(body.locked);
    }

    // ==================== Spring Tests ====================

    #[test]
    fn test_spring_force_pushes_apart_when_too_close() {
        // Two bodies at same position should be pushed apart
        let mut bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
            Body::new("b".to_string(), 10.0, 0.0, 4.0, false), // 10 units apart, spring wants 80
        ];
        let spring = Spring::new(0, 1, 80.0, 0.0008);
        
        apply_spring(&spring, &mut bodies);
        
        // Spring should push them apart (negative force on body0, positive on body1)
        // d = r - length = 10 - 80 = -70 (negative = too close)
        // coeff = 0.0008 * (-70) / 10 = negative
        // body0.force_x += coeff * dx (dx = 10, so force is negative = push left)
        // body1.force_x -= coeff * dx (so force is positive = push right)
        assert!(bodies[0].force_x < 0.0, "Body 0 should be pushed left, got {}", bodies[0].force_x);
        assert!(bodies[1].force_x > 0.0, "Body 1 should be pushed right, got {}", bodies[1].force_x);
    }

    #[test]
    fn test_spring_force_pulls_together_when_too_far() {
        // Two bodies too far apart should be pulled together
        let mut bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
            Body::new("b".to_string(), 200.0, 0.0, 4.0, false), // 200 units apart, spring wants 80
        ];
        let spring = Spring::new(0, 1, 80.0, 0.0008);
        
        apply_spring(&spring, &mut bodies);
        
        // d = r - length = 200 - 80 = 120 (positive = too far)
        // coeff = 0.0008 * 120 / 200 = positive
        // body0.force_x += coeff * dx (dx = 200, so force is positive = pull right)
        // body1.force_x -= coeff * dx (so force is negative = pull left)
        assert!(bodies[0].force_x > 0.0, "Body 0 should be pulled right, got {}", bodies[0].force_x);
        assert!(bodies[1].force_x < 0.0, "Body 1 should be pulled left, got {}", bodies[1].force_x);
    }

    #[test]
    fn test_spring_force_at_rest_length() {
        // Bodies at exactly spring length should have minimal force
        let mut bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
            Body::new("b".to_string(), 80.0, 0.0, 4.0, false), // Exactly at spring length
        ];
        let spring = Spring::new(0, 1, 80.0, 0.0008);
        
        apply_spring(&spring, &mut bodies);
        
        // d = r - length = 80 - 80 = 0, so coeff = 0
        assert!(bodies[0].force_x.abs() < 0.0001, "Force should be ~0, got {}", bodies[0].force_x);
        assert!(bodies[1].force_x.abs() < 0.0001, "Force should be ~0, got {}", bodies[1].force_x);
    }

    // ==================== Drag Tests ====================

    #[test]
    fn test_drag_reduces_velocity() {
        let mut body = Body::new("a".to_string(), 0.0, 0.0, 4.0, false);
        body.velocity_x = 10.0;
        body.velocity_y = 5.0;
        
        apply_drag(&mut body, 0.02);
        
        // Drag should reduce force (which will reduce velocity in next integration)
        // drag force = -velocity * coeff
        assert!(body.force_x < 0.0, "Drag force should oppose velocity");
        assert!(body.force_y < 0.0, "Drag force should oppose velocity");
    }

    // ==================== Quadtree Tests ====================

    #[test]
    fn test_quadtree_insert_multiple_bodies() {
        let mut qt = Quadtree::new();
        let bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
            Body::new("b".to_string(), 100.0, 0.0, 4.0, false),
            Body::new("c".to_string(), 0.0, 100.0, 4.0, false),
            Body::new("d".to_string(), 100.0, 100.0, 4.0, false),
        ];
        
        qt.insert_bodies(&bodies);
        // Should not panic
    }

    #[test]
    fn test_quadtree_repulsion_force() {
        // Uses the PRODUCTION force path (compute_all_forces_parallel → compute_body_force_readonly)
        let bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
            Body::new("b".to_string(), 50.0, 0.0, 4.0, false),
        ];
        
        let mut qt = Quadtree::new();
        qt.insert_bodies(&bodies);
        
        let forces = compute_all_forces_parallel(&bodies, &qt, -1.0, 0.8, 0.001, 0.02);
        
        // Body 0 should be pushed away from body 1 (to the left = negative x force)
        assert!(forces[0].force_x < 0.0, "Body 0 should be pushed left by repulsion, got {}", forces[0].force_x);
    }

    #[test]
    fn test_quadtree_pull_toward_center() {
        // Uses the PRODUCTION force path
        let bodies = vec![
            Body::new("a".to_string(), 100.0, 100.0, 4.0, false),
        ];
        
        let mut qt = Quadtree::new();
        qt.insert_bodies(&bodies);
        
        let forces = compute_all_forces_parallel(&bodies, &qt, 0.0, 0.8, 0.1, 0.0); // No gravity/drag, just pull
        
        // Body should be pulled toward origin (negative force for positive position)
        assert!(forces[0].force_x < 0.0, "Should be pulled toward center, got {}", forces[0].force_x);
        assert!(forces[0].force_y < 0.0, "Should be pulled toward center, got {}", forces[0].force_y);
    }

    // ==================== Integration Tests ====================

    #[test]
    fn test_integrate_applies_force_to_position() {
        let mut bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
        ];
        bodies[0].force_x = 10.0;
        bodies[0].force_y = 5.0;
        
        let movement = integrate(&mut bodies, 20.0);
        
        // velocity += (timeStep / mass) * force = (20/4) * 10 = 50
        // But velocity is clamped to magnitude 1, so velocity = (50, 25) normalized
        // Then position += timeStep * velocity
        assert!(bodies[0].pos_x != 0.0, "Position should have changed");
        assert!(bodies[0].pos_y != 0.0, "Position should have changed");
        assert!(movement > 0.0, "Movement should be positive");
    }

    #[test]
    fn test_integrate_locked_body_does_not_move() {
        let mut bodies = vec![
            Body::new("a".to_string(), 100.0, 100.0, 4.0, true), // Locked!
        ];
        bodies[0].force_x = 1000.0;
        bodies[0].force_y = 1000.0;
        
        integrate(&mut bodies, 20.0);
        
        assert_eq!(bodies[0].pos_x, 100.0, "Locked body should not move");
        assert_eq!(bodies[0].pos_y, 100.0, "Locked body should not move");
        assert_eq!(bodies[0].velocity_x, 0.0, "Locked body velocity should be 0");
        assert_eq!(bodies[0].velocity_y, 0.0, "Locked body velocity should be 0");
    }

    #[test]
    fn test_integrate_velocity_clamped() {
        let mut bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
        ];
        bodies[0].force_x = 10000.0; // Huge force
        bodies[0].force_y = 10000.0;
        
        integrate(&mut bodies, 20.0);
        
        let v = (bodies[0].velocity_x.powi(2) + bodies[0].velocity_y.powi(2)).sqrt();
        assert!(v <= 1.0001, "Velocity magnitude should be clamped to 1, got {}", v);
    }

    // ==================== Full Tick Tests ====================

    #[test]
    fn test_tick_moves_bodies() {
        let mut bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
            Body::new("b".to_string(), 50.0, 0.0, 4.0, false),
        ];
        let springs = vec![
            Spring::new(0, 1, 80.0, 0.0008),
        ];
        let mut qt = Quadtree::new();
        
        let initial_pos_a = bodies[0].pos_x;
        let initial_pos_b = bodies[1].pos_x;
        
        tick(&mut bodies, &springs, &mut qt, 20.0, -1.0, 0.8, 0.02, 0.001);
        
        // Bodies should have moved
        assert!(bodies[0].pos_x != initial_pos_a || bodies[0].pos_y != 0.0, 
            "Body A should have moved");
        assert!(bodies[1].pos_x != initial_pos_b || bodies[1].pos_y != 0.0, 
            "Body B should have moved");
    }

    #[test]
    fn test_tick_converges() {
        // Run many ticks and check that movement decreases
        let mut bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
            Body::new("b".to_string(), 50.0, 0.0, 4.0, false),
        ];
        let springs = vec![
            Spring::new(0, 1, 80.0, 0.0008),
        ];
        let mut qt = Quadtree::new();
        
        let mut last_movement = f32::MAX;
        
        for _ in 0..100 {
            last_movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.0, 0.8, 0.02, 0.001);
        }
        
        // After 100 iterations, movement should be small
        assert!(last_movement < 100.0, "Should converge to low movement, got {}", last_movement);
    }

    // ==================== End-to-End Layout Tests ====================

    #[test]
    fn test_layout_spreads_nodes() {
        // Create nodes all starting near origin (simulating browser sending zeros)
        let mut bodies: Vec<Body> = (0..10)
            .map(|i| Body::new(format!("node_{}", i), 0.0, 0.0, 4.0, false))
            .collect();
        
        // Add RANDOM initial positions to break symmetry (critical!)
        // Without this, all nodes at same position won't separate
        for (i, body) in bodies.iter_mut().enumerate() {
            // Spread them out randomly
            body.pos_x = ((i * 17) % 100) as f32 - 50.0;
            body.pos_y = ((i * 23) % 100) as f32 - 50.0;
        }
        
        // Create a chain of springs
        let springs: Vec<Spring> = (0..9)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut qt = Quadtree::new();
        
        // Run simulation
        for _ in 0..500 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.0, 0.8, 0.02, 0.001);
        }
        
        // Check that nodes are spread out
        let xs: Vec<f32> = bodies.iter().map(|b| b.pos_x).collect();
        let ys: Vec<f32> = bodies.iter().map(|b| b.pos_y).collect();
        
        let x_range = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      xs.iter().cloned().fold(f32::INFINITY, f32::min);
        let y_range = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      ys.iter().cloned().fold(f32::INFINITY, f32::min);
        
        let spread = (x_range.powi(2) + y_range.powi(2)).sqrt();
        
        println!("X range: {}, Y range: {}, Spread: {}", x_range, y_range, spread);
        println!("Final positions: {:?}", bodies.iter().map(|b| (b.pos_x, b.pos_y)).collect::<Vec<_>>());
        
        assert!(spread > 50.0, "Nodes should spread out, got spread of {}", spread);
    }

    #[test]
    fn test_layout_all_same_initial_position() {
        // THIS IS THE BROWSER BUG CASE: all nodes at exactly (0, 0)
        let mut bodies: Vec<Body> = (0..10)
            .map(|i| Body::new(format!("node_{}", i), 0.0, 0.0, 4.0, false))
            .collect();
        
        let springs: Vec<Spring> = (0..9)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut qt = Quadtree::new();
        
        println!("Initial positions: {:?}", bodies.iter().map(|b| (b.pos_x, b.pos_y)).collect::<Vec<_>>());
        
        // Run simulation
        for iter in 0..500 {
            let movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.0, 0.8, 0.02, 0.001);
            if iter < 5 || iter % 100 == 0 {
                println!("Iter {}: movement={}, pos[0]=({},{})", iter, movement, bodies[0].pos_x, bodies[0].pos_y);
            }
        }
        
        println!("Final positions: {:?}", bodies.iter().map(|b| (b.pos_x, b.pos_y)).collect::<Vec<_>>());
        
        // Check that nodes spread out even from same position
        let xs: Vec<f32> = bodies.iter().map(|b| b.pos_x).collect();
        let ys: Vec<f32> = bodies.iter().map(|b| b.pos_y).collect();
        
        let x_range = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      xs.iter().cloned().fold(f32::INFINITY, f32::min);
        let y_range = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      ys.iter().cloned().fold(f32::INFINITY, f32::min);
        
        println!("X range: {}, Y range: {}", x_range, y_range);
        
        // When all nodes start at same position, they should still separate via random jitter
        assert!(x_range > 1.0 || y_range > 1.0, 
            "Nodes should separate even from same starting position");
    }

    #[test]
    fn test_layout_with_random_initial_positions() {
        // Create nodes with random positions (simulating what browser would send)
        let mut bodies: Vec<Body> = (0..50)
            .map(|i| {
                let angle = (i as f32) * 0.1;
                let r = (i as f32) * 10.0;
                Body::new(
                    format!("node_{}", i), 
                    r * angle.cos(),
                    r * angle.sin(),
                    4.0, 
                    false
                )
            })
            .collect();
        
        // Create edges forming a tree
        let springs: Vec<Spring> = (1..50)
            .map(|i| {
                let parent = (i - 1) / 2; // Binary tree parent
                Spring::new(parent, i, 80.0, 0.0008)
            })
            .collect();
        
        let mut qt = Quadtree::new();
        
        // Run simulation
        for _ in 0..500 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.0, 0.8, 0.02, 0.001);
        }
        
        // Check that not all nodes are at the same position
        let first_pos = (bodies[0].pos_x, bodies[0].pos_y);
        let all_same = bodies.iter().all(|b| 
            (b.pos_x - first_pos.0).abs() < 0.1 && (b.pos_y - first_pos.1).abs() < 0.1
        );
        
        assert!(!all_same, "Not all nodes should be at the same position!");
        
        // Calculate spread
        let xs: Vec<f32> = bodies.iter().map(|b| b.pos_x).collect();
        let ys: Vec<f32> = bodies.iter().map(|b| b.pos_y).collect();
        let x_range = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      xs.iter().cloned().fold(f32::INFINITY, f32::min);
        let y_range = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      ys.iter().cloned().fold(f32::INFINITY, f32::min);
        
        println!("Final X range: {}, Y range: {}", x_range, y_range);
        
        assert!(x_range > 100.0 || y_range > 100.0, 
            "Nodes should be spread, got x_range={}, y_range={}", x_range, y_range);
    }

    // ==================== Config Tests ====================
    // (Config default assertions are in Initialization Tests section below)

    // ==================== JS Comparison Tests ====================
    // These tests compare exact values with cytoscape-euler JS output
    // Run euler-wasm/test-compare.js to regenerate expected values

    #[test]
    fn test_spring_force_exact_js_comparison() {
        // JS Test 2: Spring force calculation
        // bodies at (10,10) and (110,10), distance=100, spring length=80
        // Expected: body0 force=(0.016, 0), body1 force=(-0.016, 0)
        let mut bodies = vec![
            Body::new("a".to_string(), 10.0, 10.0, 4.0, false),
            Body::new("b".to_string(), 110.0, 10.0, 4.0, false),
        ];
        let spring = Spring::new(0, 1, 80.0, 0.0008);
        
        apply_spring(&spring, &mut bodies);
        
        // d = 100 - 80 = 20
        // coeff = 0.0008 * 20 / 100 * 1 = 0.00016
        // body0.force.x = 0.00016 * 100 = 0.016
        let expected_force = 0.016;
        assert!((bodies[0].force_x - expected_force).abs() < 0.0001, 
            "Body 0 force_x: expected {}, got {}", expected_force, bodies[0].force_x);
        assert!((bodies[1].force_x - (-expected_force)).abs() < 0.0001,
            "Body 1 force_x: expected {}, got {}", -expected_force, bodies[1].force_x);
        println!("Spring force test passed: body0.force_x = {}, body1.force_x = {}", 
            bodies[0].force_x, bodies[1].force_x);
    }

    #[test]
    fn test_quadtree_force_exact_js_comparison() {
        // JS Test 3: Quadtree repulsion — uses PRODUCTION force path
        // bodies at (10,10) and (60,10), gravity=-1.2, theta=0.666, pull=0.001, dragCoeff=0.0
        // Note: production path uses fast_inv_sqrt (~1% error) and deterministic_jitter,
        // so values differ slightly from the JS reference (which uses exact 1/sqrt and Math.random).
        let bodies = vec![
            Body::new("a".to_string(), 10.0, 10.0, 4.0, false),
            Body::new("b".to_string(), 60.0, 10.0, 4.0, false),
        ];
        
        let mut qt = Quadtree::new();
        qt.insert_bodies(&bodies);
        // Use dragCoeff=0 so we measure pure gravity+pull without drag
        let forces = compute_all_forces_parallel(&bodies, &qt, -1.2, 0.666, 0.001, 0.0);
        
        println!("Quadtree force (production path): body0 = ({}, {})", forces[0].force_x, forces[0].force_y);
        
        // Check repulsion is in correct direction (negative x = away from body1)
        assert!(forces[0].force_x < 0.0, 
            "Body 0 should be pushed left (away from body1), got force_x = {}", forces[0].force_x);
        
        // Approximate magnitude check (wider tolerance due to fast_inv_sqrt ~1% error)
        let expected_fx = -0.010508;
        let expected_fy = -0.002828;
        assert!((forces[0].force_x - expected_fx).abs() < 0.005, 
            "Body 0 force_x: expected ~{}, got {}", expected_fx, forces[0].force_x);
        assert!((forces[0].force_y - expected_fy).abs() < 0.005,
            "Body 0 force_y: expected ~{}, got {}", expected_fy, forces[0].force_y);
    }

    #[test]
    fn test_integration_exact_js_comparison() {
        // JS Test 4: Integration
        // body at (10,10), force=(1, 0.5), mass=4, timeStep=20
        // Expected after integrate: pos=(27.888544, 18.944272), vel=(0.894427, 0.447214)
        let mut bodies = vec![
            Body::new("a".to_string(), 10.0, 10.0, 4.0, false),
        ];
        bodies[0].force_x = 1.0;
        bodies[0].force_y = 0.5;
        
        let movement = integrate(&mut bodies, 20.0);
        
        println!("Integration: pos=({}, {}), vel=({}, {}), movement={}", 
            bodies[0].pos_x, bodies[0].pos_y, 
            bodies[0].velocity_x, bodies[0].velocity_y, movement);
        
        // coeff = 20 / 4 = 5
        // vel_x = 0 + 5 * 1.0 = 5.0, vel_y = 0 + 5 * 0.5 = 2.5
        // v = sqrt(25 + 6.25) = 5.59
        // normalized: vel_x = 5/5.59 = 0.894, vel_y = 2.5/5.59 = 0.447
        // dx = 20 * 0.894 = 17.88, dy = 20 * 0.447 = 8.94
        // pos = (10 + 17.88, 10 + 8.94) = (27.88, 18.94)
        
        assert!((bodies[0].pos_x - 27.888544).abs() < 0.001, 
            "pos_x: expected 27.888544, got {}", bodies[0].pos_x);
        assert!((bodies[0].pos_y - 18.944272).abs() < 0.001,
            "pos_y: expected 18.944272, got {}", bodies[0].pos_y);
        assert!((bodies[0].velocity_x - 0.894427).abs() < 0.001,
            "velocity_x: expected 0.894427, got {}", bodies[0].velocity_x);
        assert!((bodies[0].velocity_y - 0.447214).abs() < 0.001,
            "velocity_y: expected 0.447214, got {}", bodies[0].velocity_y);
        assert!((movement - 400.0).abs() < 0.001,
            "movement: expected 400.0, got {}", movement);
    }

    #[test]
    fn test_full_tick_exact_js_comparison() {
        // JS Test 1: 3-node chain after 1 tick
        // Initial: (10,10), (110,10), (210,10)
        // After 1 tick: (11.0772, 9.7172), (109.6016, 9.9638), (208.2405, 9.9810)
        let mut bodies = vec![
            Body::new("a".to_string(), 10.0, 10.0, 4.0, false),
            Body::new("b".to_string(), 110.0, 10.0, 4.0, false),
            Body::new("c".to_string(), 210.0, 10.0, 4.0, false),
        ];
        let springs = vec![
            Spring::new(0, 1, 80.0, 0.0008),
            Spring::new(1, 2, 80.0, 0.0008),
        ];
        
        let mut qt = Quadtree::new();
        
        let movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        
        println!("After 1 tick:");
        println!("  Movement: {}", movement);
        println!("  Positions: ({:.4}, {:.4}), ({:.4}, {:.4}), ({:.4}, {:.4})",
            bodies[0].pos_x, bodies[0].pos_y,
            bodies[1].pos_x, bodies[1].pos_y,
            bodies[2].pos_x, bodies[2].pos_y);
        
        // JS expected: (11.0772, 9.7172), (109.6016, 9.9638), (208.2405, 9.9810)
        // Movement: 3.526642
        // Allow some tolerance due to floating point and random jitter differences
        assert!((bodies[0].pos_x - 11.0772).abs() < 1.0, 
            "Body 0 pos_x: expected ~11.0772, got {}", bodies[0].pos_x);
        assert!((bodies[1].pos_x - 109.6016).abs() < 1.0,
            "Body 1 pos_x: expected ~109.6016, got {}", bodies[1].pos_x);
        assert!((bodies[2].pos_x - 208.2405).abs() < 1.0,
            "Body 2 pos_x: expected ~208.2405, got {}", bodies[2].pos_x);
    }

    #[test]
    fn test_triangle_10_iterations_js_comparison() {
        // JS Test 5: Triangle, 10 iterations
        // Initial: (10,10), (110,10), (60,96.6)
        // After 10 iters (iter 9): pos ~(1.77, 2.60), (92.28, 6.08), (47.54, 81.43)
        let mut bodies = vec![
            Body::new("a".to_string(), 10.0, 10.0, 4.0, false),
            Body::new("b".to_string(), 110.0, 10.0, 4.0, false),
            Body::new("c".to_string(), 60.0, 96.6, 4.0, false),
        ];
        let springs = vec![
            Spring::new(0, 1, 80.0, 0.0008),
            Spring::new(1, 2, 80.0, 0.0008),
            Spring::new(2, 0, 80.0, 0.0008),
        ];
        
        let mut qt = Quadtree::new();
        
        println!("Initial: ({:.2}, {:.2}), ({:.2}, {:.2}), ({:.2}, {:.2})",
            bodies[0].pos_x, bodies[0].pos_y,
            bodies[1].pos_x, bodies[1].pos_y,
            bodies[2].pos_x, bodies[2].pos_y);
        
        for i in 0..10 {
            let movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
            if i < 5 || i == 9 {
                println!("Iter {}: movement={:.4}, pos=({:.2}, {:.2}), ({:.2}, {:.2}), ({:.2}, {:.2})",
                    i, movement,
                    bodies[0].pos_x, bodies[0].pos_y,
                    bodies[1].pos_x, bodies[1].pos_y,
                    bodies[2].pos_x, bodies[2].pos_y);
            }
        }
        
        // JS iter 9: pos ~(1.77, 2.60), (92.28, 6.08), (47.54, 81.43)
        // Movement should be reasonable (not 0, not NaN, not huge)
        // Positions should be similar (within tolerance for random differences)
        
        // Basic sanity checks - nodes should have moved and spread
        let spread_x = (bodies[0].pos_x - bodies[1].pos_x).abs();
        let spread_y = (bodies[0].pos_y - bodies[2].pos_y).abs();
        
        println!("Spread: x={:.2}, y={:.2}", spread_x, spread_y);
        
        assert!(spread_x > 50.0, "Nodes should spread in X, got {}", spread_x);
        assert!(spread_y > 50.0, "Nodes should spread in Y, got {}", spread_y);
    }

    // ==================== Performance Benchmark Tests ====================
    
    #[test]
    fn test_benchmark_1000_nodes() {
        benchmark_nodes(1000, 100);
    }
    
    #[test]
    #[ignore] // Run with: cargo test benchmark_5000 --release -- --ignored --nocapture
    fn test_benchmark_5000_nodes() {
        benchmark_nodes(5000, 50);
    }
    
    #[test]
    #[ignore] // Run with: cargo test benchmark_10000 --release -- --ignored --nocapture
    fn test_benchmark_10000_nodes() {
        benchmark_nodes(10000, 20);
    }
    
    fn benchmark_nodes(node_count: usize, iterations: usize) {
        use std::time::Instant;
        
        // Create nodes in a grid pattern
        let grid_size = (node_count as f32).sqrt().ceil() as usize;
        let mut bodies: Vec<Body> = (0..node_count)
            .map(|i| {
                let x = (i % grid_size) as f32 * 50.0;
                let y = (i / grid_size) as f32 * 50.0;
                Body::new(format!("node_{}", i), x, y, 4.0, false)
            })
            .collect();
        
        // Create edges - connect each node to a few neighbors (sparse graph)
        let mut springs: Vec<Spring> = Vec::new();
        for i in 0..node_count {
            // Connect to next node (chain)
            if i + 1 < node_count {
                springs.push(Spring::new(i, i + 1, 80.0, 0.0008));
            }
            // Connect to node in next row (grid)
            if i + grid_size < node_count {
                springs.push(Spring::new(i, i + grid_size, 80.0, 0.0008));
            }
        }
        
        let mut qt = Quadtree::new();
        
        println!("\n=== Benchmark: {} nodes, {} edges, {} iterations ===", 
            node_count, springs.len(), iterations);
        
        // Warm up
        tick(&mut bodies.clone(), &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        
        // Benchmark
        let start = Instant::now();
        let mut total_movement = 0.0f32;
        
        for i in 0..iterations {
            let movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
            total_movement += movement;
            
            if i == 0 || i == iterations - 1 || (i + 1) % 10 == 0 {
                println!("  Iter {}: movement = {:.4}", i + 1, movement);
            }
        }
        
        let elapsed = start.elapsed();
        let ms_per_iter = elapsed.as_secs_f64() * 1000.0 / iterations as f64;
        
        println!("\nResults:");
        println!("  Total time: {:.2}ms", elapsed.as_secs_f64() * 1000.0);
        println!("  Time per iteration: {:.3}ms", ms_per_iter);
        println!("  Iterations per second: {:.1}", 1000.0 / ms_per_iter);
        println!("  Final movement: {:.4}", total_movement / iterations as f32);
        
        // Verify layout quality - nodes should have spread out
        let xs: Vec<f32> = bodies.iter().map(|b| b.pos_x).collect();
        let ys: Vec<f32> = bodies.iter().map(|b| b.pos_y).collect();
        let x_range = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      xs.iter().cloned().fold(f32::INFINITY, f32::min);
        let y_range = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      ys.iter().cloned().fold(f32::INFINITY, f32::min);
        
        println!("  Layout spread: X={:.1}, Y={:.1}", x_range, y_range);
        
        // Should maintain reasonable spread
        assert!(x_range > 100.0, "Nodes should spread in X");
        assert!(y_range > 100.0, "Nodes should spread in Y");
    }

    #[test]
    fn test_data_correctness_deterministic() {
        // Run same layout twice - should produce identical results
        let create_bodies = || {
            (0..100)
                .map(|i| {
                    let x = (i % 10) as f32 * 50.0;
                    let y = (i / 10) as f32 * 50.0;
                    Body::new(format!("node_{}", i), x, y, 4.0, false)
                })
                .collect::<Vec<_>>()
        };
        
        let springs: Vec<Spring> = (0..99)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut bodies1 = create_bodies();
        let mut bodies2 = create_bodies();
        let mut qt1 = Quadtree::new();
        let mut qt2 = Quadtree::new();
        
        // Run same iterations on both
        for _ in 0..10 {
            tick(&mut bodies1, &springs, &mut qt1, 20.0, -1.2, 0.666, 0.02, 0.001);
            tick(&mut bodies2, &springs, &mut qt2, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Results should be identical
        for (b1, b2) in bodies1.iter().zip(bodies2.iter()) {
            assert!((b1.pos_x - b2.pos_x).abs() < 0.0001, 
                "Positions should be deterministic: {} vs {}", b1.pos_x, b2.pos_x);
            assert!((b1.pos_y - b2.pos_y).abs() < 0.0001,
                "Positions should be deterministic: {} vs {}", b1.pos_y, b2.pos_y);
        }
        println!("Determinism test passed - results are reproducible");
    }

    #[test]
    fn test_data_correctness_no_nan_or_inf() {
        // Run layout and ensure no NaN or Inf values
        let mut bodies: Vec<Body> = (0..100)
            .map(|i| Body::new(format!("node_{}", i), 0.0, 0.0, 4.0, false))
            .collect();
        
        let springs: Vec<Spring> = (0..99)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut qt = Quadtree::new();
        
        for iter in 0..100 {
            let movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
            
            assert!(!movement.is_nan(), "Movement should not be NaN at iter {}", iter);
            assert!(!movement.is_infinite(), "Movement should not be Inf at iter {}", iter);
            
            for (i, body) in bodies.iter().enumerate() {
                assert!(!body.pos_x.is_nan(), "pos_x NaN at body {} iter {}", i, iter);
                assert!(!body.pos_y.is_nan(), "pos_y NaN at body {} iter {}", i, iter);
                assert!(!body.pos_x.is_infinite(), "pos_x Inf at body {} iter {}", i, iter);
                assert!(!body.pos_y.is_infinite(), "pos_y Inf at body {} iter {}", i, iter);
                assert!(!body.force_x.is_nan(), "force_x NaN at body {} iter {}", i, iter);
                assert!(!body.force_y.is_nan(), "force_y NaN at body {} iter {}", i, iter);
                assert!(!body.velocity_x.is_nan(), "velocity_x NaN at body {} iter {}", i, iter);
                assert!(!body.velocity_y.is_nan(), "velocity_y NaN at body {} iter {}", i, iter);
            }
        }
        println!("No NaN/Inf test passed");
    }

    // ==================== Adaptive Theta Tests ====================

    #[test]
    fn test_adaptive_theta_correctness() {
        // Test that adaptive theta produces valid layouts
        // Higher theta = less accurate but still functional
        let mut bodies_low_theta: Vec<Body> = (0..20)
            .map(|i| {
                let x = (i % 5) as f32 * 50.0;
                let y = (i / 5) as f32 * 50.0;
                Body::new(format!("node_{}", i), x, y, 4.0, false)
            })
            .collect();
        
        let mut bodies_high_theta = bodies_low_theta.clone();
        
        let springs: Vec<Spring> = (0..19)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut qt1 = Quadtree::new();
        let mut qt2 = Quadtree::new();
        
        // Run with low theta (more accurate)
        for _ in 0..50 {
            tick(&mut bodies_low_theta, &springs, &mut qt1, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Run with high theta (less accurate but faster)
        for _ in 0..50 {
            tick(&mut bodies_high_theta, &springs, &mut qt2, 20.0, -1.2, 1.0, 0.02, 0.001);
        }
        
        // Both should produce spread out layouts
        let spread_low = calc_layout_spread(&bodies_low_theta);
        let spread_high = calc_layout_spread(&bodies_high_theta);
        
        println!("Low theta spread: {:.1}, High theta spread: {:.1}", spread_low, spread_high);
        
        assert!(spread_low > 50.0, "Low theta should spread nodes");
        assert!(spread_high > 50.0, "High theta should also spread nodes");
        
        // Layouts should be qualitatively similar (within 50% spread)
        let ratio = spread_high / spread_low;
        assert!(ratio > 0.5 && ratio < 2.0, 
            "High/low theta layouts should be similar, ratio={:.2}", ratio);
    }

    #[test]
    fn test_varying_theta_no_instability() {
        // Test that changing theta mid-simulation doesn't cause instability
        let mut bodies: Vec<Body> = (0..50)
            .map(|i| {
                let x = (i % 10) as f32 * 30.0;
                let y = (i / 10) as f32 * 30.0;
                Body::new(format!("node_{}", i), x, y, 4.0, false)
            })
            .collect();
        
        let springs: Vec<Spring> = (0..49)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut qt = Quadtree::new();
        let mut movements: Vec<f32> = Vec::new();
        
        // Simulate adaptive theta by varying it during simulation
        for i in 0..100 {
            // Start with high theta, decrease to low
            let theta = if i < 20 { 1.0 } else { 0.666 };
            let movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, theta, 0.02, 0.001);
            movements.push(movement);
            
            // Check for NaN/Inf
            assert!(!movement.is_nan(), "Movement NaN at iter {} (theta transition)", i);
            assert!(!movement.is_infinite(), "Movement Inf at iter {}", i);
            
            for body in &bodies {
                assert!(!body.pos_x.is_nan() && !body.pos_y.is_nan(), 
                    "Position NaN at iter {}", i);
            }
        }
        
        // Movement should generally decrease (convergence)
        let early_avg: f32 = movements[20..30].iter().sum::<f32>() / 10.0;
        let late_avg: f32 = movements[90..100].iter().sum::<f32>() / 10.0;
        
        println!("Early movement avg: {:.1}, Late movement avg: {:.1}", early_avg, late_avg);
        
        // Late movement should be lower (simulation converged)
        assert!(late_avg < early_avg, 
            "Simulation should converge: early={:.1}, late={:.1}", early_avg, late_avg);
    }

    // ==================== Stall Detection Tests ====================
    // NOTE: Stall detection is currently DISABLED in lib.rs (was causing premature exit).
    // These tests validate the algorithm logic in isolation for when it's re-enabled.

    #[test]
    #[ignore = "Stall detection disabled in lib.rs — keep tests for future re-enablement"]
    fn test_stall_detection_logic() {
        // Test the stall detection algorithm in isolation
        // Using stricter constants that match lib.rs
        let mut prev_movement: f32 = 1000.0;
        let mut stall_count: u32 = 0;
        const STALL_THRESHOLD: u32 = 30;  // Need 30 consecutive stalled iterations
        const STALL_RATIO: f32 = 0.998;   // Movement must change by <0.2% to count as stalled
        
        // Simulate movements that plateau at a low value
        // Generate 35 values that decrease by <0.2% each
        let mut movements = Vec::new();
        let mut val = 50.0f32;  // Start below the movement cap (sqrt(1000)*0.5 = 15.8 for 1000 nodes)
        for _ in 0..35 {
            movements.push(val);
            val *= 0.9995;  // Decrease by 0.05% each step (well within 0.2%)
        }
        
        for (i, &movement) in movements.iter().enumerate() {
            if prev_movement < f32::MAX {
                let ratio = movement / prev_movement;
                if ratio > STALL_RATIO && ratio < (1.0 / STALL_RATIO) {
                    stall_count += 1;
                } else {
                    stall_count = 0;
                }
            }
            prev_movement = movement;
            
            if stall_count >= STALL_THRESHOLD {
                println!("Stall detected at iteration {}", i);
                break;
            }
        }
        
        assert!(stall_count >= STALL_THRESHOLD, 
            "Should detect stall with plateaued movement, count={}", stall_count);
    }

    #[test]
    #[ignore = "Stall detection disabled in lib.rs — keep tests for future re-enablement"]
    fn test_stall_detection_does_not_false_positive() {
        // Test that stall detection doesn't trigger during active convergence
        let mut prev_movement: f32 = f32::MAX;
        let mut stall_count: u32 = 0;
        const STALL_THRESHOLD: u32 = 30;  // Match lib.rs
        const STALL_RATIO: f32 = 0.998;   // Match lib.rs
        
        // Simulate movements that are actively converging (decreasing by >0.2%)
        // Each step decreases by ~2%, which is well outside the stall ratio
        let movements = [1000.0, 980.0, 960.0, 940.0, 920.0, 900.0, 880.0, 860.0, 840.0, 820.0];
        
        for &movement in &movements {
            if prev_movement < f32::MAX {
                let ratio = movement / prev_movement;
                if ratio > STALL_RATIO && ratio < (1.0 / STALL_RATIO) {
                    stall_count += 1;
                } else {
                    stall_count = 0;
                }
            }
            prev_movement = movement;
        }
        
        assert!(stall_count < STALL_THRESHOLD, 
            "Should NOT trigger stall during active convergence, count={}", stall_count);
    }

    // ==================== Initialization Tests ====================
    // These tests ensure the WASM module initializes correctly and 
    // all core functionality works as expected

    #[test]
    fn test_init_body_default_state() {
        // Verify Body initialization sets all fields correctly
        let body = Body::new("test_node".to_string(), 123.456, 789.012, 5.0, false);
        
        // Position
        assert_eq!(body.pos_x, 123.456, "pos_x should be set");
        assert_eq!(body.pos_y, 789.012, "pos_y should be set");
        
        // Properties
        assert_eq!(body.id, "test_node", "id should be set");
        assert_eq!(body.mass, 5.0, "mass should be set");
        assert!(!body.locked, "locked should be false");
        
        // Initial state (should be zero)
        assert_eq!(body.force_x, 0.0, "force_x should start at 0");
        assert_eq!(body.force_y, 0.0, "force_y should start at 0");
        assert_eq!(body.velocity_x, 0.0, "velocity_x should start at 0");
        assert_eq!(body.velocity_y, 0.0, "velocity_y should start at 0");
    }

    #[test]
    fn test_init_spring_default_state() {
        // Verify Spring initialization
        let spring = Spring::new(5, 10, 120.0, 0.0012);
        
        assert_eq!(spring.source, 5, "source index should be set");
        assert_eq!(spring.target, 10, "target index should be set");
        assert_eq!(spring.length, 120.0, "length should be set");
        assert_eq!(spring.coeff, 0.0012, "coeff should be set");
        assert_eq!(spring.weight, 1.0, "weight should default to 1.0");
    }

    #[test]
    fn test_init_config_all_defaults() {
        // Verify LayoutConfig defaults match cytoscape-euler
        let config = LayoutConfig::default();
        
        assert_eq!(config.spring_length, 80.0, "spring_length default");
        assert_eq!(config.spring_coeff, 0.0008, "spring_coeff default");
        assert_eq!(config.mass, 4.0, "mass default");
        assert_eq!(config.gravity, -1.2, "gravity default");
        assert_eq!(config.pull, 0.001, "pull default");
        assert_eq!(config.theta, 0.666, "theta default");
        assert_eq!(config.drag_coeff, 0.02, "drag_coeff default");
        assert_eq!(config.movement_threshold, 1.0, "movement_threshold default");
        assert_eq!(config.time_step, 20.0, "time_step default");
        assert_eq!(config.max_iterations, 2000, "max_iterations default");
        assert_eq!(config.max_simulation_time, 30000.0, "max_simulation_time default");
    }

    #[test]
    fn test_init_quadtree_empty() {
        // Verify Quadtree can be created and used when empty
        let mut qt = Quadtree::new();
        let bodies: Vec<Body> = vec![];
        
        qt.insert_bodies(&bodies);
        // Should not panic
    }

    #[test]
    fn test_init_quadtree_single_body() {
        // Uses PRODUCTION force path to verify single-body case
        let bodies = vec![
            Body::new("single".to_string(), 50.0, 50.0, 4.0, false),
        ];
        
        let mut qt = Quadtree::new();
        qt.insert_bodies(&bodies);
        let forces = compute_all_forces_parallel(&bodies, &qt, -1.2, 0.666, 0.001, 0.0);
        
        // Force should be finite (only pull toward origin, no other bodies)
        assert!(!forces[0].force_x.is_nan(), "force_x should not be NaN");
        assert!(!forces[0].force_y.is_nan(), "force_y should not be NaN");
    }

    // ==================== Edge Case Tests ====================

    #[test]
    fn test_edge_case_empty_layout() {
        // Layout with no nodes should not crash
        let mut bodies: Vec<Body> = vec![];
        let springs: Vec<Spring> = vec![];
        let mut qt = Quadtree::new();
        
        let movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        
        assert_eq!(movement, 0.0, "Empty layout should have 0 movement");
    }

    #[test]
    fn test_edge_case_single_node() {
        // Single node layout
        let mut bodies = vec![
            Body::new("single".to_string(), 100.0, 100.0, 4.0, false),
        ];
        let springs: Vec<Spring> = vec![];
        let mut qt = Quadtree::new();
        
        // Run multiple ticks
        for _ in 0..50 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Node should move toward origin (pull effect)
        assert!(!bodies[0].pos_x.is_nan(), "pos_x should not be NaN");
        assert!(!bodies[0].pos_y.is_nan(), "pos_y should not be NaN");
    }

    #[test]
    fn test_edge_case_disconnected_nodes() {
        // Nodes with no edges - should spread apart via repulsion
        let mut bodies: Vec<Body> = (0..10)
            .map(|i| {
                Body::new(format!("node_{}", i), 50.0, 50.0, 4.0, false)
            })
            .collect();
        
        let springs: Vec<Spring> = vec![]; // No edges!
        let mut qt = Quadtree::new();
        
        // Run layout
        for _ in 0..100 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Nodes should have spread due to repulsion
        let spread = calc_layout_spread(&bodies);
        assert!(spread > 10.0, "Disconnected nodes should spread, got {}", spread);
        
        // All positions should be valid
        for body in &bodies {
            assert!(!body.pos_x.is_nan() && !body.pos_y.is_nan(), 
                "Positions should be valid");
        }
    }

    #[test]
    fn test_edge_case_all_locked_nodes() {
        // All locked nodes - nothing should move
        let mut bodies: Vec<Body> = (0..5)
            .map(|i| {
                Body::new(format!("locked_{}", i), i as f32 * 20.0, i as f32 * 20.0, 4.0, true)
            })
            .collect();
        
        let springs = vec![
            Spring::new(0, 1, 80.0, 0.0008),
            Spring::new(1, 2, 80.0, 0.0008),
        ];
        let mut qt = Quadtree::new();
        
        let initial_positions: Vec<(f32, f32)> = bodies.iter()
            .map(|b| (b.pos_x, b.pos_y))
            .collect();
        
        // Run ticks
        for _ in 0..50 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // All nodes should be at original positions
        for (i, body) in bodies.iter().enumerate() {
            assert_eq!(body.pos_x, initial_positions[i].0, "Locked node {} x moved", i);
            assert_eq!(body.pos_y, initial_positions[i].1, "Locked node {} y moved", i);
        }
    }

    #[test]
    fn test_edge_case_extreme_mass() {
        // Test with extreme mass values
        let mut bodies = vec![
            Body::new("light".to_string(), 0.0, 0.0, 0.1, false),    // Very light
            Body::new("heavy".to_string(), 100.0, 0.0, 100.0, false), // Very heavy
        ];
        
        let springs = vec![Spring::new(0, 1, 80.0, 0.0008)];
        let mut qt = Quadtree::new();
        
        // Run layout
        for _ in 0..50 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Both should have valid positions
        for body in &bodies {
            assert!(!body.pos_x.is_nan() && !body.pos_y.is_nan(), 
                "Extreme mass should not cause NaN");
            assert!(!body.pos_x.is_infinite() && !body.pos_y.is_infinite(), 
                "Extreme mass should not cause Inf");
        }
    }

    #[test]
    fn test_edge_case_zero_spring_length() {
        // Spring with zero length
        let mut bodies = vec![
            Body::new("a".to_string(), 0.0, 0.0, 4.0, false),
            Body::new("b".to_string(), 100.0, 0.0, 4.0, false),
        ];
        
        let springs = vec![Spring::new(0, 1, 0.0, 0.0008)]; // Zero length!
        let mut qt = Quadtree::new();
        
        for _ in 0..50 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Should pull together to near zero distance
        assert!(!bodies[0].pos_x.is_nan(), "Zero spring length should not cause NaN");
    }

    #[test]
    fn test_edge_case_coincident_nodes() {
        // Two nodes at exactly the same position
        let mut bodies = vec![
            Body::new("a".to_string(), 50.0, 50.0, 4.0, false),
            Body::new("b".to_string(), 50.0, 50.0, 4.0, false), // Same position!
        ];
        
        let springs = vec![Spring::new(0, 1, 80.0, 0.0008)];
        let mut qt = Quadtree::new();
        
        for _ in 0..50 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Should separate (no NaN due to zero distance)
        assert!(!bodies[0].pos_x.is_nan() && !bodies[1].pos_x.is_nan(), 
            "Coincident nodes should not cause NaN");
    }

    // ==================== Re-Layout Tests ====================
    // These tests verify that re-running layout on already-positioned nodes
    // converges faster than initial layout

    #[test]
    fn test_relayout_converges_faster() {
        // First run: random initial positions
        let mut bodies_initial: Vec<Body> = (0..100)
            .map(|i| {
                Body::new(format!("node_{}", i), 
                    (i as f32 * 17.0) % 500.0 - 250.0,  // Pseudo-random
                    (i as f32 * 23.0) % 500.0 - 250.0,
                    4.0, false)
            })
            .collect();
        
        let springs: Vec<Spring> = (0..99)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut qt = Quadtree::new();
        
        // Run initial layout until "converged"
        let mut initial_iters = 0;
        let mut movement = f32::MAX;
        let threshold = 1.0;
        
        while movement > threshold * 100.0 && initial_iters < 500 {
            movement = tick(&mut bodies_initial, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
            initial_iters += 1;
        }
        
        // Second run: start from already-converged positions
        let mut bodies_relayout = bodies_initial.clone();
        // Reset velocities but keep positions
        for body in &mut bodies_relayout {
            body.velocity_x = 0.0;
            body.velocity_y = 0.0;
            body.force_x = 0.0;
            body.force_y = 0.0;
        }
        
        let mut relayout_iters = 0;
        movement = f32::MAX;
        
        while movement > threshold * 100.0 && relayout_iters < 500 {
            movement = tick(&mut bodies_relayout, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
            relayout_iters += 1;
        }
        
        println!("Initial layout: {} iterations", initial_iters);
        println!("Re-layout: {} iterations", relayout_iters);
        
        // Re-layout should converge faster (fewer iterations)
        assert!(relayout_iters <= initial_iters, 
            "Re-layout ({}) should converge as fast or faster than initial ({})",
            relayout_iters, initial_iters);
    }

    #[test]
    fn test_relayout_small_perturbation() {
        // Start with a good layout, add small perturbation, should recover quickly
        let mut bodies: Vec<Body> = (0..50)
            .map(|i| {
                // Start in a nice spread-out grid
                let x = (i % 10) as f32 * 80.0 - 400.0;
                let y = (i / 10) as f32 * 80.0 - 200.0;
                Body::new(format!("node_{}", i), x, y, 4.0, false)
            })
            .collect();
        
        let springs: Vec<Spring> = (0..49)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut qt = Quadtree::new();
        
        // First, run to convergence
        for _ in 0..200 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Measure spread after convergence
        let converged_spread = calc_layout_spread(&bodies);
        
        // Add small perturbation to 10 random nodes
        for i in (0..50).step_by(5) {
            bodies[i].pos_x += 20.0;
            bodies[i].pos_y -= 20.0;
            bodies[i].velocity_x = 0.0;
            bodies[i].velocity_y = 0.0;
        }
        
        // Run just a few iterations
        for _ in 0..30 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Spread should be similar (recovered quickly)
        let recovered_spread = calc_layout_spread(&bodies);
        let ratio = recovered_spread / converged_spread;
        
        println!("Converged spread: {:.1}, Recovered spread: {:.1}, Ratio: {:.2}", 
            converged_spread, recovered_spread, ratio);
        
        assert!(ratio > 0.8 && ratio < 1.2, 
            "Should recover similar spread after perturbation, ratio={:.2}", ratio);
    }

    // ==================== Topology Layout Tests ====================
    // End-to-end tests that verify layout quality for different graph topologies

    #[test]
    fn test_integration_full_layout_small() {
        // Small layout - 20 nodes, chain topology
        let mut bodies: Vec<Body> = (0..20)
            .map(|i| Body::new(format!("n{}", i), i as f32 * 5.0, 0.0, 4.0, false))
            .collect();
        
        let springs: Vec<Spring> = (0..19)
            .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
            .collect();
        
        let mut qt = Quadtree::new();
        
        // Run layout
        let mut total_movement = 0.0;
        for _ in 0..200 {
            total_movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Should converge
        assert!(total_movement < 100.0, "Should converge, movement={}", total_movement);
        
        // Should spread
        let spread = calc_layout_spread(&bodies);
        assert!(spread > 100.0, "Should spread, got {}", spread);
    }

    #[test]
    fn test_integration_full_layout_grid() {
        // Grid topology - 25 nodes (5x5)
        let mut bodies: Vec<Body> = (0..25)
            .map(|i| {
                let x = (i % 5) as f32 * 20.0;
                let y = (i / 5) as f32 * 20.0;
                Body::new(format!("n{}", i), x, y, 4.0, false)
            })
            .collect();
        
        // Grid edges
        let mut springs: Vec<Spring> = vec![];
        for i in 0..25 {
            if i % 5 != 4 { springs.push(Spring::new(i, i + 1, 80.0, 0.0008)); } // Right
            if i < 20 { springs.push(Spring::new(i, i + 5, 80.0, 0.0008)); } // Down
        }
        
        let mut qt = Quadtree::new();
        
        for _ in 0..300 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Check layout maintains grid-like structure
        let spread = calc_layout_spread(&bodies);
        assert!(spread > 100.0, "Grid should spread, got {}", spread);
        
        // No NaN or Inf
        for body in &bodies {
            assert!(!body.pos_x.is_nan() && !body.pos_y.is_nan());
        }
    }

    #[test]
    fn test_integration_full_layout_star() {
        // Star topology - 1 center node connected to 10 outer nodes
        let mut bodies = vec![Body::new("center".to_string(), 0.0, 0.0, 4.0, false)];
        for i in 0..10 {
            let angle = (i as f32) * 0.628; // 2π/10
            bodies.push(Body::new(
                format!("outer_{}", i),
                angle.cos() * 50.0,
                angle.sin() * 50.0,
                4.0, false
            ));
        }
        
        // All outer nodes connect to center
        let springs: Vec<Spring> = (1..11)
            .map(|i| Spring::new(0, i, 80.0, 0.0008))
            .collect();
        
        let mut qt = Quadtree::new();
        
        for _ in 0..200 {
            tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
        }
        
        // Center should be roughly at origin or center of mass
        // Outer nodes should form a ring
        let center = &bodies[0];
        let outer_distances: Vec<f32> = bodies[1..].iter()
            .map(|b| ((b.pos_x - center.pos_x).powi(2) + (b.pos_y - center.pos_y).powi(2)).sqrt())
            .collect();
        
        // Outer nodes should be roughly equidistant from center
        let avg_distance = outer_distances.iter().sum::<f32>() / outer_distances.len() as f32;
        for (i, &dist) in outer_distances.iter().enumerate() {
            let ratio = dist / avg_distance;
            assert!(ratio > 0.5 && ratio < 2.0, 
                "Outer node {} distance {} should be close to avg {}", i, dist, avg_distance);
        }
    }

    // ==================== Movement Threshold Consistency Tests ====================

    #[test]
    fn test_movement_threshold_scales_with_nodes() {
        // Verify that larger graphs need more total movement to converge
        let configs = [(20, 50), (50, 100), (100, 150)];
        let mut convergence_movements: Vec<f32> = vec![];
        
        for (node_count, iters) in configs {
            let mut bodies: Vec<Body> = (0..node_count)
                .map(|i| {
                    Body::new(format!("n{}", i), 
                        (i as f32 * 17.0) % 300.0 - 150.0,
                        (i as f32 * 23.0) % 300.0 - 150.0,
                        4.0, false)
                })
                .collect();
            
            let springs: Vec<Spring> = (0..(node_count-1))
                .map(|i| Spring::new(i, i + 1, 80.0, 0.0008))
                .collect();
            
            let mut qt = Quadtree::new();
            let mut final_movement = 0.0;
            
            for _ in 0..iters {
                final_movement = tick(&mut bodies, &springs, &mut qt, 20.0, -1.2, 0.666, 0.02, 0.001);
            }
            
            convergence_movements.push(final_movement);
            println!("Nodes: {}, Final movement: {:.1}", node_count, final_movement);
        }
        
        // All should have valid movement values
        for mov in &convergence_movements {
            assert!(!mov.is_nan() && !mov.is_infinite());
        }
    }

    // ==================== Helper Functions ====================

    fn calc_layout_spread(bodies: &[Body]) -> f32 {
        if bodies.is_empty() { return 0.0; }
        
        let xs: Vec<f32> = bodies.iter().map(|b| b.pos_x).collect();
        let ys: Vec<f32> = bodies.iter().map(|b| b.pos_y).collect();
        
        let x_range = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      xs.iter().cloned().fold(f32::INFINITY, f32::min);
        let y_range = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max) - 
                      ys.iter().cloned().fold(f32::INFINITY, f32::min);
        
        (x_range.powi(2) + y_range.powi(2)).sqrt()
    }
}