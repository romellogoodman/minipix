import { createSeededRandom, randomNumber, map } from "../utils/index.js";
import { rendererConfig } from "./config.js";

const stackedCircle = ({ canvas, image, seed = Date.now() }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");

  // Set canvas to original image dimensions
  canvas.width = image.width;
  canvas.height = image.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create seeded random function
  const random = createSeededRandom(seed);

  ctx.save();

  // Randomly choose between uniform (50%) and scaled (50%) mode
  const isUniform = random() < 0.5;

  // Random number of stacks
  const config = rendererConfig.stackedCircle;
  const numStacks = randomNumber(
    config.numStacks.min,
    config.numStacks.max,
    random
  );

  // Randomly choose rotation mode: 0 = none, 1 = random, 2 = gradual
  const rotationMode = Math.floor(random() * 3);
  const targetRotation =
    rotationMode === 2
      ? randomNumber(config.rotation.min, config.rotation.max, random)
      : 0;

  if (isUniform) {
    // UNIFORM MODE: All stacks are the same size with concentric rings
    const width = image.width;
    const height = image.height;
    const x = 0;
    const y = 0;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(width, height) / 2;

    // Render layers from back to front
    Array.from({ length: numStacks }).forEach((_, i) => {
      // Calculate rotation based on mode
      let rotation = 0;
      if (rotationMode === 1 && i !== 0) {
        // Random rotation for each layer (except first)
        rotation = randomNumber(
          config.rotation.min,
          config.rotation.max,
          random
        );
      } else if (rotationMode === 2) {
        // Gradual rotation mapped from 0 to target
        rotation = map(i, 0, numStacks - 1, 0, targetRotation);
      }

      ctx.save();

      // First layer (i=0) is unclipped full image
      if (i === 0) {
        // Apply rotation for first layer if needed
        if (rotation !== 0) {
          ctx.translate(centerX, centerY);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }
        ctx.drawImage(image, x, y, width, height);
      } else {
        // Calculate the radius for this layer (from max to smaller, skipping i=0)
        const radiusFactor = map(i, 1, numStacks - 1, 1, 0.2);
        const outerRadius = maxRadius * radiusFactor;

        // For all but the last layer, clip to a ring (donut shape)
        if (i < numStacks - 1) {
          // Calculate the inner radius (next layer's radius)
          const nextRadiusFactor = map(i + 1, 1, numStacks - 1, 1, 0.2);
          const innerRadius = maxRadius * nextRadiusFactor;

          // Create outer circle
          ctx.beginPath();
          ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);

          // Cut out inner circle (reverse winding for clipping)
          ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
          ctx.clip();
        } else {
          // Last layer is just a filled circle
          ctx.beginPath();
          ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
          ctx.clip();
        }

        // Apply rotation to the image content
        if (rotation !== 0) {
          ctx.translate(centerX, centerY);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }

        ctx.drawImage(image, x, y, width, height);
      }

      ctx.restore();
    });
  } else {
    // SCALED MODE: Stacks get progressively smaller
    Array.from({ length: numStacks }).forEach((_, i) => {
      const sizeFactor = map(
        i,
        0,
        numStacks - 1,
        config.sizeFactor.max,
        config.sizeFactor.min
      );
      const width = image.width * sizeFactor;
      const height = image.height * sizeFactor;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;

      // Calculate rotation based on mode
      let rotation = 0;
      if (rotationMode === 1 && i !== 0) {
        // Random rotation for each layer (except first)
        rotation = randomNumber(
          config.rotation.min,
          config.rotation.max,
          random
        );
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
  }

  ctx.restore();
};

stackedCircle.displayName = "stackedCircle";

export default stackedCircle;
