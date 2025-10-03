export const renderImage = (image) => (canvas) => {
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
