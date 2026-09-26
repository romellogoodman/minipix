# Minipix

A generative art tool for creating computational collages from images using various rendering algorithms with seeded randomness for reproducible results.

Try it at [minipix.romellogoodman.com](https://minipix.romellogoodman.com).

## Features

- Single-canvas studio: pick a source, a renderer, and a seed, and see one large output
- 37 rendering algorithms, grouped and described in the renderer picker
- Seeded randomness for reproducible artwork, with a "lock seed" toggle
- Per-renderer parameter sliders: leave a parameter on auto or pin it to a value
- A filmstrip of your 12 most recent variations to step back through
- Download or copy the output with a descriptive filename including the seed hash;
  save and load settings as JSON
- Upload your own images (PNG/JPEG) via drag-and-drop or file selection
- Pixel-heavy renderers run in a pool of Web Workers to keep the UI responsive
- **CLI rendering** with node-canvas for batch processing

Example images:

- [*Tree Pæony*](https://www.getty.edu/art/collection/object/108QM6) by Ogawa Kazumasa (1896), public domain (CC0), via the J. Paul Getty Museum's Open Content Program.
- [*Surface and cloud-top temperatures from MTG-Sounder*](https://www.esa.int/ESA_Multimedia/Images/2026/01/Global_surface_and_cloud-top_temperatures_by_MTG-Sounder), ESA. Data by Thales and OHB under Eumetsat and ESA, visual by Eumetsat.

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

1. **Source**: Click an example thumbnail, or upload your own with the upload tile (or drop it anywhere on the page)
2. **Renderer**: Choose a renderer; its description appears below the picker
3. **Variation**: Type a seed or press **R** to reroll (a new seed, with every parameter back to auto). Turn on *Lock seed* to keep the seed while changing renderer. Drag a parameter slider to pin it; untouched ones stay on auto (their random range)
4. **Export**: Press **D** or *Download* to save `{imagename}-minipix-{renderer}-{hash}.{ext}` (JPEG sources save as `.jpg`, everything else as `.png`), copy the image or a link, or save the settings as JSON

Use **←/→** to step through the filmstrip of recent variations.

#### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `renderer` | Start on this renderer (the first valid name of a comma-separated list). | `?renderer=spiral` |
| `seed` | Start on this seed. Accepts the base36 hash from a filename or a decimal seed. | `?renderer=spiral&seed=00009ix` |

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

**Motion** (still-image takes on motion-graphics techniques)
- `arrowField` - Vector-field overlay: arrows follow the image's edge orientation
- `echo` - Discrete strobe-frame ghosts stepping, rotating, or zooming away
- `motionMask` - Self-differencing edge mask with fading echoes, heat-map coloured
- `smear` - Long-exposure smear along a slide, curve, or rotation with a soft shutter
- `velocityBlur` - Per-region motion blur (pan, rotate, bands, or moving blobs)

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
- Lower `--compression` (e.g., 3) for faster PNG writes
- JPEG quality 0.85-0.95 provides good balance of speed/quality

## Seeded Randomness

Each canvas uses a unique random seed that controls all randomization within the renderer. This means:
- Same seed = identical visual output
- Filenames include the seed as a 7-character base36 hash
- Easy to share and recreate specific variations

## License

[MIT](LICENSE)
