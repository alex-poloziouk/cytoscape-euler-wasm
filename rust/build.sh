#!/bin/bash
set -e

echo "Building euler-wasm..."

# Build with wasm-pack (use release mode for optimizations)
wasm-pack build --target web --release

# Copy output to Angular public assets (served at runtime)
mkdir -p ../public/assets/wasm
cp pkg/euler_wasm_bg.wasm ../public/assets/wasm/
cp pkg/euler_wasm.js ../public/assets/wasm/

echo "Build complete! WASM files copied to public/assets/wasm/"
echo ""
echo "Files deployed:"
ls -la ../public/assets/wasm/euler_wasm*
