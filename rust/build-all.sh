#!/bin/bash
# ============================================================================
# WASM Euler Layout Build Script
# ============================================================================
#
# Builds two versions of the WASM module:
# 1. Standard (single-threaded) - Maximum browser compatibility
# 2. Threaded (multi-threaded)  - Better performance on modern browsers
#
# PREREQUISITES:
# --------------
# 1. Rust (stable + nightly for threading):
#    rustup target add wasm32-unknown-unknown
#    rustup toolchain install nightly
#    rustup component add rust-src --toolchain nightly
#
# 2. wasm-pack:
#    cargo install wasm-pack
#
# 3. (Optional) wasm-opt for additional optimization:
#    npm install -g wasm-opt  # or via binaryen package
#
# USAGE:
# ------
#   ./build-all.sh           # Build both versions
#   ./build-all.sh standard  # Build only standard version
#   ./build-all.sh threaded  # Build only threaded version
#   ./build-all.sh clean     # Clean build artifacts
#
# MANUAL BUILD COMMANDS:
# ----------------------
# Standard:
#   RUSTFLAGS='-C target-feature=+simd128' \
#   wasm-pack build --target web --release --out-dir pkg
#
# Threaded (requires nightly):
#   RUSTFLAGS='-C target-feature=+simd128,+atomics,+bulk-memory \
#     -Clink-arg=--shared-memory -Clink-arg=--max-memory=268435456 \
#     -Clink-arg=--import-memory -Clink-arg=--export=__wasm_init_tls \
#     -Clink-arg=--export=__tls_size -Clink-arg=--export=__tls_align \
#     -Clink-arg=--export=__tls_base' \
#   rustup run nightly wasm-pack build --target web --release \
#     --out-dir pkg-threaded -- --features parallel -Z build-std=panic_abort,std
#
# ============================================================================

set -e

cd "$(dirname "$0")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Handle clean command
if [ "$1" = "clean" ]; then
    print_header "Cleaning build artifacts"
    rm -rf pkg pkg-threaded target
    rm -f ../dist/wasm/euler_wasm.js ../dist/wasm/euler_wasm_bg.wasm
    rm -rf ../dist/wasm-threaded
    print_success "Clean complete"
    exit 0
fi

print_header "WASM Euler Layout Build"

# Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    print_error "wasm-pack not found"
    echo "Install with: cargo install wasm-pack"
    exit 1
fi
print_success "wasm-pack found: $(wasm-pack --version)"

# Check Rust version
print_success "Rust: $(rustc --version)"

# ============================================================================
# STANDARD BUILD (Single-threaded, with SIMD for modern browsers)
# ============================================================================
if [ "$1" != "threaded" ]; then
    print_header "Building Standard Version (single-threaded + SIMD)"
    
    echo "Options: --release, opt-level=3, lto=fat, codegen-units=1, SIMD128"
    
    # Enable SIMD128 for ~20-40% faster math operations on modern browsers
    # SIMD is supported in Chrome 91+, Firefox 89+, Safari 16.4+
    export RUSTFLAGS='-C target-feature=+simd128'
    
    wasm-pack build \
        --target web \
        --release \
        --out-dir pkg
    
    # Deploy to public assets
    mkdir -p ../dist/wasm
    cp pkg/euler_wasm.js pkg/euler_wasm_bg.wasm ../dist/wasm/
    
    STANDARD_SIZE=$(ls -lh ../dist/wasm/euler_wasm_bg.wasm | awk '{print $5}')
    print_success "Standard build complete: $STANDARD_SIZE"
    echo "  Deployed to: ../dist/wasm/"
fi

# ============================================================================
# THREADED BUILD (Multi-threaded with Rayon)
# ============================================================================
if [ "$1" != "standard" ]; then
    print_header "Building Threaded Version (multi-threaded)"
    
    # Check for nightly toolchain
    if ! rustup run nightly rustc --version &> /dev/null; then
        print_warning "Skipping threaded build (nightly toolchain not found)"
        echo ""
        echo "To enable threaded builds, install nightly:"
        echo "  rustup toolchain install nightly"
        echo "  rustup component add rust-src --toolchain nightly"
    else
        print_success "Nightly: $(rustup run nightly rustc --version)"
        
        # Check for rust-src component
        if ! rustup run nightly rustc --print sysroot | xargs -I{} test -d "{}/lib/rustlib/src/rust"; then
            print_warning "rust-src component may be missing"
            echo "Install with: rustup component add rust-src --toolchain nightly"
        fi
        
        echo ""
        echo "RUSTFLAGS for threading + SIMD:"
        echo "  +atomics, +bulk-memory, +simd128, --shared-memory, --import-memory"
        echo "  --max-memory=256MB, TLS exports"
        echo ""
        
        # Critical RUSTFLAGS for wasm-bindgen-rayon + SIMD
        # Each flag explained:
        # - simd128: Enable 128-bit SIMD for faster math (Chrome 91+, Firefox 89+)
        # - atomics: Enable atomic operations (required for SharedArrayBuffer)
        # - bulk-memory: Enable bulk memory operations (faster memory copy)
        # - --shared-memory: Create SharedArrayBuffer-compatible memory
        # - --max-memory: Set max memory to 256MB (required for shared memory;
        #   enough for 100K+ node graphs — actual usage is ~5-10MB for 20K nodes)
        # - --import-memory: Allow memory to be imported (for worker threads)
        # - TLS exports: Export thread-local storage functions for worker init
        export RUSTFLAGS='-C target-feature=+simd128,+atomics,+bulk-memory -Clink-arg=--shared-memory -Clink-arg=--max-memory=268435456 -Clink-arg=--import-memory -Clink-arg=--export=__wasm_init_tls -Clink-arg=--export=__tls_size -Clink-arg=--export=__tls_align -Clink-arg=--export=__tls_base'
        
        rustup run nightly wasm-pack build \
            --target web \
            --release \
            --out-dir pkg-threaded \
            -- --features parallel \
            -Z build-std=panic_abort,std
        
        # Deploy to public assets
        mkdir -p ../dist/wasm-threaded
        cp pkg-threaded/euler_wasm.js pkg-threaded/euler_wasm_bg.wasm ../dist/wasm-threaded/
        
        # Copy and patch rayon worker helpers
        if [ -d pkg-threaded/snippets ]; then
            cp -r pkg-threaded/snippets ../dist/wasm-threaded/
            
            # Fix relative import path for dev servers
            # Changes: import('../../..') → import('../../../euler_wasm.js')
            find ../dist/wasm-threaded/snippets -name "workerHelpers.js" \
                -exec sed -i "s|import('../../..')|import('../../../euler_wasm.js')|g" {} \;
            
            print_success "Patched workerHelpers.js import paths"
        fi
        
        THREADED_SIZE=$(ls -lh ../dist/wasm-threaded/euler_wasm_bg.wasm | awk '{print $5}')
        print_success "Threaded build complete: $THREADED_SIZE"
        echo "  Deployed to: ../dist/wasm-threaded/"
    fi
fi

# ============================================================================
# BUILD SUMMARY
# ============================================================================
print_header "Build Summary"

if [ -f ../dist/wasm/euler_wasm_bg.wasm ]; then
    SIZE=$(ls -lh ../dist/wasm/euler_wasm_bg.wasm | awk '{print $5}')
    echo -e "Standard:  ${GREEN}$SIZE${NC}  ../dist/wasm/"
fi

if [ -f ../dist/wasm-threaded/euler_wasm_bg.wasm ]; then
    SIZE=$(ls -lh ../dist/wasm-threaded/euler_wasm_bg.wasm | awk '{print $5}')
    echo -e "Threaded:  ${GREEN}$SIZE${NC}  ../dist/wasm-threaded/"
    
    # Verify shared memory is enabled
    if grep -q "shared:true" ../dist/wasm-threaded/euler_wasm.js 2>/dev/null; then
        print_success "SharedArrayBuffer enabled in threaded build"
    else
        print_warning "SharedArrayBuffer may not be enabled"
    fi
fi

echo ""
echo "Build complete! Restart the Angular dev server to use new WASM."
echo ""
