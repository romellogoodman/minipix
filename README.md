# Minipix

A generative art tool for creating computational collages from images using various rendering algorithms with seeded randomness for reproducible results.

## Features

- Upload multiple images (PNG/JPEG) via drag-and-drop or file selection
- Generate infinite variations using 25+ different rendering algorithms
- Seeded randomness for reproducible artwork
- Configurable renderer parameters
- Download individual canvases with descriptive filenames including seed hash
- Toggle images on/off from the generation pool
- Responsive layout with infinite scroll
- **CLI rendering** with node-canvas for batch processing
- Parallel rendering for fast generation of multiple variations

## Getting Started

### Web Interface

```bash
npm install
npm run dev
```

### CLI Rendering

```bash
npm install
npm run render -- --file=image.jpg --count=5
```

## Usage

### Web Interface

1. **Upload Images**: Drag and drop images onto the page or click the upload button
2. **Toggle Images**: Click thumbnails in the sidebar to enable/disable images
3. **Download**: Click any canvas to download with format: `{imagename}-minipix-{renderer}-{seed}.jpg`
4. **Reproduce**: Use the seed in the filename to recreate exact results

### CLI Rendering

Generate artwork from the command line with full control over rendering parameters:

```bash
# Basic usage - generate one random variation
npm run render -- --file=path/to/image.jpg

# Generate multiple variations
npm run render -- --file=image.jpg --count=10

# Use a specific renderer
npm run render -- --file=image.jpg --renderer=barSwap --count=5

# Reproducible output with seed
npm run render -- --file=image.jpg --seed=12345

# Fast JPEG output for batch processing
npm run render -- --file=image.jpg --count=20 --format=jpeg --quality=0.9

# Lower PNG compression for faster writes
npm run render -- --file=image.jpg --format=png --compression=3

# Custom output directory
npm run render -- --file=image.jpg --output=./my-renders

# Sequential rendering (disable parallel processing)
npm run render -- --file=image.jpg --count=5 --no-parallel

# Show available renderers and options
npm run render -- --help
```

#### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--file=<path>` | Path to input image (required) | - |
| `--count=<number>` | Number of variations to generate | 1 |
| `--renderer=<name>` | Specific renderer to use | random |
| `--seed=<number>` | Seed for reproducible output | random |
| `--output=<path>` | Output directory | `./output` |
| `--format=<png\|jpeg>` | Output format | `png` |
| `--quality=<0-1>` | JPEG quality (0-1) | 0.92 |
| `--compression=<0-9>` | PNG compression level (0-9) | 6 |

When `--count` is greater than 1 with a fixed `--seed`, each image uses
`seed + index` so the outputs are distinct and reproducible.

#### Available Renderers

**Geometric**
- `barSwap` - Shuffles horizontal or vertical bars
- `circlePacking` - Fills the canvas with sampled-color circles
- `gridSwap` - Shuffles grid tiles with aspect-ratio adaptation
- `kaleidoscope` - Mirrored kaleidoscope effect
- `lowPoly` - Low-polygon triangulation
- `pixelated` - Adaptive block-based pixelation
- `scooch` - Wraps edge slices to opposite side
- `stacked` - Layered effect with varying scales
- `stackedCircle` - Circular clipped stacks with rotation
- `subdivision` - Recursive fragmentation with flips

**Halftone & Dithering**
- `halftone` - Halftone effect with multiple modes
- `halftoneBayer` - Bayer matrix dithering
- `halftoneClassicDots` - Classic halftone dots
- `halftoneFloydSteinberg` - Floyd-Steinberg dithering
- `halftoneLines` - Line-based halftone
- `dither` - Multi-mode dithering with an extracted palette
- `crosshatch` - Crosshatch drawing style
- `posterize` - Reduce colors to discrete bands

**Distortion**
- `glitch` - Horizontal slice displacement with color inversion
- `melt` - Downward pixel melting
- `pixelSort` - Glitch art pixel reordering by luminance
- `radialBlur` - Zoom blur from center point
- `ripple` - Concentric wave distortion
- `spiral` - Rotational twist effect
- `waves` - Sinusoidal displacement

**Vintage & Film**
- `crt` - CRT monitor effect with scanlines, curvature, bloom
- `duotone` - Two-color gradient mapping
- `filmGrain` - Vintage film with grain, vignette, scratches
- `lightLeak` - Analog light-leak overlay
- `risograph` - Risograph print effect
- `vhs` - VHS tape degradation effect

**Artistic**
- `asciiMosaic` - ASCII character mosaic
- `neonEdge` - Neon edge-detection glow
- `oilPaint` - Kuwahara filter painterly effect
- `photocopy` - High-contrast photocopy effect
- `sketch` - Pencil drawing with edge detection and hatching

#### Performance Tips

- Use `--format=jpeg` for ~5-10x faster file writing
- Parallel rendering is enabled by default for multiple images
- Lower `--compression` (e.g., 3) for faster PNG writes
- JPEG quality 0.85-0.95 provides good balance of speed/quality

## Seeded Randomness

Each canvas uses a unique random seed that controls all randomization within the renderer. This means:
- Same seed = identical visual output
- Filenames include the seed as a 6-character hash
- Easy to share and recreate specific variations
