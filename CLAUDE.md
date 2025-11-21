This is a computational collage app built with React. It allows users to upload images and generate random artistic variations using different rendering algorithms.

Minipix is a generative art tool that:

- Accepts multiple image uploads (PNG/JPEG)
- Displays a 3×4 grid (12 canvases) of computational collages
- Randomly assigns uploaded images and rendering functions to each canvas
- Uses seeded randomness for reproducible artwork
- Allows toggling individual images on/off from the generation pool
- Supports downloading individual canvas outputs with descriptive filenames including seed hash

## Project Structure

```
src/
├── scss/           # SCSS stylesheets
│   ├── main.scss
│   └── modern-reset.scss
├── main.jsx        # React entry point
├── App.jsx         # Main App component - handles image upload and grid layout
├── Canvas.jsx      # Canvas component - renders individual canvases
├── renderers.js    # Rendering algorithms for image manipulation
├── utils.js        # Utility functions including seeded PRNG
└── App.scss        # App component styles
```

## Architecture

### App.jsx

Main application component that manages:

- Image upload and state (`allImages`, `availableImages`)
- Image availability toggling via thumbnail interface
- Random image and renderer selection (or hardcoded via query parameter)
- Infinite scroll canvas grid rendering with 20 canvases per page
- Unique seed generation for each canvas (0xFFFFFFFF range)
- Canvas download functionality with descriptive filenames: `{originalname}-minipix-{renderer}-{hash}.{ext}`
- Filters enabled renderers using `rendererConfig` object

**Query Parameters:**
- `renderer`: Specify a renderer by name to use for all canvases (e.g., `?renderer=renderStacked`)
  - Available renderer names: `renderBarSwap`, `renderGridSwap`, `renderPixelated`, `renderScooch`, `renderStacked`, `renderStackedCircle`, `renderSubdivision`
  - If invalid or not provided, random selection is used

### Canvas.jsx

Reusable canvas component that:

- Accepts `renderFn`, `image`, `seed`, and `onClick` props
- Executes the rendering function on mount, passing the seed
- Handles click events for canvas download

### renderers.js

Collection of rendering algorithms exported as named functions:

- `renderBarSwap`: Shuffles horizontal or vertical bars
- `renderGridSwap`: Shuffles grid tiles with aspect-ratio adaptation
- `renderPixelated`: Adaptive block-based pixelation effect
- `renderScooch`: Wraps edge slice to opposite side
- `renderStacked`: Creates layered effect with 4-12 stacks at varying scales (100%-25%)
- `renderStackedCircle`: Circular clipped stacks with optional rotation
- `renderSubdivision`: Recursive fragmentation with binary space partitioning

**Renderer Configuration:**
- `rendererConfig` object at the top of the file controls each renderer's parameters and enabled state
- Each renderer entry includes `enabled: boolean` and configurable min/max ranges
- App.jsx filters renderers based on `enabled` flag
- Example config structure:
  ```javascript
  export const rendererConfig = {
    renderBarSwap: {
      enabled: true,
      numBars: { min: 4, max: 50 },
    },
    // ...
  };
  ```

**Renderer Function Signature:**
- All renderers follow: `({ canvas, image, seed = Date.now() }) => void`
- `seed` parameter controls all randomness within the renderer using seeded PRNG
- Canvas dimensions are set to original image dimensions (preserves aspect ratio and resolution)
- Each renderer creates a seeded random function: `const random = createSeededRandom(seed);`
- All randomization uses the seeded random function instead of `Math.random()`

### utils.js

Utility functions for rendering:

- `mulberry32(seed)`: Mulberry32 PRNG implementation for seeded randomness
- `createSeededRandom(seed)`: Creates a seeded random function from a seed value
- `randomNumber(min, max, randomFn)`: Generates random integers with optional seeded random function
- `applyRandomFlip(ctx, width, height, randomFn)`: Randomly flips canvas horizontally/vertically
- `calculateAdaptivePixelSize(width, height, randomFn)`: Calculates pixelation block size
- `shuffleArray(array, randomFn)`: Fisher-Yates shuffle with optional seeded randomness
- All functions accept optional `randomFn` parameter (defaults to `Math.random`)

## CSS/SCSS Conventions

- Use BEM (Block Element Modifier) naming methodology for CSS classes
- Follow the pattern: `.block__element--modifier`
- Key BEM blocks: `.nav`, `.canvas-grid`, `.canvas`
- Modifiers: `.nav__thumbnail--active`, `.nav__thumbnail--inactive`

## Seeded Randomness

Minipix uses seeded randomness to make artwork reproducible:

- Each canvas receives a unique random seed (0x00000000 to 0xFFFFFFFF)
- Seeds are converted to 6-character base36 hashes for filenames
- Same seed + renderer = identical visual output every time
- Seed controls only renderer's internal randomness (not image/renderer selection)
- Uses Mulberry32 PRNG algorithm for consistent cross-platform results

**Implementation:**
```javascript
// Generate seed in App.jsx
const seed = Math.floor(Math.random() * 0xFFFFFFFF);

// Create seeded random function in renderer
const random = createSeededRandom(seed);

// Use in place of Math.random()
const value = randomNumber(min, max, random);
```

## Adding New Renderers

To add a new rendering algorithm:

1. Add configuration entry to `rendererConfig` object at top of `renderers.js`:
   ```javascript
   rendererName: {
     enabled: true,
     parameterName: { min: value, max: value },
     // ... other configurable parameters
   }
   ```

2. Export a new renderer function in `renderers.js`:
   ```javascript
   export const rendererName = ({ canvas, image, seed = Date.now() }) => {
     if (!image) return;
     const ctx = canvas.getContext("2d");
     canvas.width = image.width;
     canvas.height = image.height;

     // Create seeded random function
     const random = createSeededRandom(seed);

     // Use config values
     const config = rendererConfig.rendererName;
     const paramValue = randomNumber(config.parameterName.min, config.parameterName.max, random);

     // Rendering logic using random() instead of Math.random()
   };
   ```

3. Keep renderers in alphabetical order by function name for easier navigation and maintenance

4. The function will automatically be included in the random selection pool if `enabled: true` in config
