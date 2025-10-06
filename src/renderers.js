import { map, randomNumber } from "./utils";

export const renderImage = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");
  const parent = canvas.parentElement;

  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;

  const scale = Math.min(
    canvas.width / image.width,
    canvas.height / image.height
  );
  const x = (canvas.width - image.width * scale) / 2;
  const y = (canvas.height - image.height * scale) / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
};

export const renderImageStacked = ({ canvas, image }) => {
  if (!image) return;

  const ctx = canvas.getContext("2d");
  const parent = canvas.parentElement;

  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;

  const baseScale = Math.min(
    canvas.width / image.width,
    canvas.height / image.height
  );

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Random number of stacks between 4 and 12
  const numStacks = randomNumber(4, 12);

  // Create stacks with sizes mapped from 100% down to 25%
  Array.from({ length: numStacks }).forEach((_, i) => {
    const sizeFactor = map(i, 0, numStacks - 1, 1, 0.25);
    const scale = baseScale * sizeFactor;
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(image, x, y, width, height);
  });
};
