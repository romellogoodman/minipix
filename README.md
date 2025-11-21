# Minipix

A generative art tool for creating computational collages from images using various rendering algorithms with seeded randomness for reproducible results.

## Features

- Upload multiple images (PNG/JPEG) via drag-and-drop or file selection
- Generate infinite variations using 10 different rendering algorithms
- Seeded randomness for reproducible artwork
- Configurable renderer parameters
- Download individual canvases with descriptive filenames including seed hash
- Toggle images on/off from the generation pool
- Responsive layout with infinite scroll

## Getting Started

```bash
npm install
npm run dev
```

## Usage

1. **Upload Images**: Drag and drop images onto the page or click the upload button
2. **Toggle Images**: Click thumbnails in the sidebar to enable/disable images
3. **Download**: Click any canvas to download with format: `{imagename}-minipix-{renderer}-{seed}.jpg`
4. **Reproduce**: Use the seed in the filename to recreate exact results

## Seeded Randomness

Each canvas uses a unique random seed that controls all randomization within the renderer. This means:
- Same seed = identical visual output
- Filenames include the seed as a 6-character hash
- Easy to share and recreate specific variations
