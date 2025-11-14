import { map, randomNumber } from "./utils";

export const renderImage = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, image.width, image.height);
};

export const renderImageStacked = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Random number of stacks between 4 and 12
  const numStacks = randomNumber(4, 12);

  // Create stacks with sizes mapped from 100% down to 25%
  Array.from({ length: numStacks }).forEach((_, i) => {
    const sizeFactor = map(i, 0, numStacks - 1, 1, 0.25);
    const width = image.width * sizeFactor;
    const height = image.height * sizeFactor;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(image, x, y, width, height);
  });
};

export const renderImageStackedCircle = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Random number of stacks between 4 and 12
  const numStacks = randomNumber(4, 12);

  // Randomly choose rotation mode: 0 = none, 1 = random, 2 = gradual
  const rotationMode = Math.floor(Math.random() * 3);
  const targetRotation = rotationMode === 2 ? randomNumber(-180, 180) : 0;

  // Create stacks with sizes mapped from 100% down to 25%
  Array.from({ length: numStacks }).forEach((_, i) => {
    const sizeFactor = map(i, 0, numStacks - 1, 1, 0.25);
    const width = image.width * sizeFactor;
    const height = image.height * sizeFactor;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    // Calculate rotation based on mode
    let rotation = 0;
    if (rotationMode === 1 && i !== 0) {
      // Random rotation for each layer (except first)
      rotation = randomNumber(-180, 180);
    } else if (rotationMode === 2) {
      // Gradual rotation mapped from 0 to target
      rotation = map(i, 0, numStacks - 1, 0, targetRotation);
    }

    ctx.save();

    // Apply rotation if needed
    if (rotation !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    // First layer is not clipped, rest are circles
    if (i === 0) {
      ctx.drawImage(image, x, y, width, height);
    } else {
      ctx.beginPath();
      const radius = Math.min(width, height) / 2;
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.drawImage(image, x, y, width, height);
    }

    ctx.restore();
  });
};
