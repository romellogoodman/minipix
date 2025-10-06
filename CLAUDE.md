# Project Guidelines

This is a computational collage app built with React. It allows users to upload images and generate random artistic variations using different rendering algorithms.

## Project Overview

Minipix is a generative art tool that:
- Accepts multiple image uploads (PNG/JPEG)
- Displays a 3×4 grid (12 canvases) of computational collages
- Randomly assigns uploaded images and rendering functions to each canvas
- Allows toggling individual images on/off from the generation pool
- Supports downloading individual canvas outputs with original filename prefixes

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
└── App.scss        # App component styles
```

## Architecture

### App.jsx
Main application component that manages:
- Image upload and state (`allImages`, `availableImages`)
- Image availability toggling via thumbnail interface
- Random image and renderer selection
- 12-canvas grid rendering
- Canvas download functionality with filename preservation

### Canvas.jsx
Reusable canvas component that:
- Accepts a `renderFn` prop (curried rendering function)
- Executes the rendering function on mount
- Handles click events for canvas download

### renderers.js
Collection of rendering algorithms exported as named functions:
- `renderImage`: Standard fit-to-canvas image rendering
- `renderImageStacked`: Creates layered effect with 4-12 stacks at varying scales (100%-25%)
- Each renderer is a curried function: `(image) => (canvas) => void`
- Includes utility functions like `map()` for value remapping

## CSS/SCSS Conventions

- Use BEM (Block Element Modifier) naming methodology for CSS classes
- Follow the pattern: `.block__element--modifier`
- Key BEM blocks: `.nav`, `.canvas-grid`, `.canvas`
- Modifiers: `.nav__thumbnail--active`, `.nav__thumbnail--inactive`

## Adding New Renderers

To add a new rendering algorithm:
1. Export a new curried function in `renderers.js`
2. Function signature: `export const rendererName = (image) => (canvas) => { /* rendering logic */ }`
3. The function will automatically be included in the random selection pool
