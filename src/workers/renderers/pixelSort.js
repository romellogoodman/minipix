import { map } from "../utils.js";

export default function pixelSort({ imageData, width, height, config, random, outputData }) {
  outputData.set(imageData);

  const threshold = map(random(), 0, 1, config.threshold.min, config.threshold.max);
  const sortLengthPercent = map(random(), 0, 1, config.sortLength.min, config.sortLength.max);
  const isVertical = random() < 0.5;
  const reverse = random() < config.reverseProbability;

  const getLuminance = (idx) => {
    return (0.299 * outputData[idx] + 0.587 * outputData[idx + 1] + 0.114 * outputData[idx + 2]) / 255;
  };

  const sortFn = reverse
    ? (a, b) => b.lum - a.lum
    : (a, b) => a.lum - b.lum;

  if (isVertical) {
    for (let x = 0; x < width; x++) {
      let sortStart = -1;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const lum = getLuminance(idx);

        if (lum > threshold && sortStart === -1) {
          sortStart = y;
        } else if ((lum <= threshold || y === height - 1) && sortStart !== -1) {
          const sortEnd = y;
          const runLength = sortEnd - sortStart;
          const maxLen = Math.floor(runLength * sortLengthPercent);
          if (maxLen > 1) {
            const pixels = [];
            for (let sy = sortStart; sy < sortStart + maxLen; sy++) {
              const sIdx = (sy * width + x) * 4;
              pixels.push({
                r: outputData[sIdx],
                g: outputData[sIdx + 1],
                b: outputData[sIdx + 2],
                lum: getLuminance(sIdx),
              });
            }
            pixels.sort(sortFn);
            for (let i = 0; i < pixels.length; i++) {
              const sIdx = ((sortStart + i) * width + x) * 4;
              outputData[sIdx] = pixels[i].r;
              outputData[sIdx + 1] = pixels[i].g;
              outputData[sIdx + 2] = pixels[i].b;
            }
          }
          sortStart = -1;
        }
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      let sortStart = -1;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const lum = getLuminance(idx);

        if (lum > threshold && sortStart === -1) {
          sortStart = x;
        } else if ((lum <= threshold || x === width - 1) && sortStart !== -1) {
          const sortEnd = x;
          const runLength = sortEnd - sortStart;
          const maxLen = Math.floor(runLength * sortLengthPercent);
          if (maxLen > 1) {
            const pixels = [];
            for (let sx = sortStart; sx < sortStart + maxLen; sx++) {
              const sIdx = (y * width + sx) * 4;
              pixels.push({
                r: outputData[sIdx],
                g: outputData[sIdx + 1],
                b: outputData[sIdx + 2],
                lum: getLuminance(sIdx),
              });
            }
            pixels.sort(sortFn);
            for (let i = 0; i < pixels.length; i++) {
              const sIdx = (y * width + (sortStart + i)) * 4;
              outputData[sIdx] = pixels[i].r;
              outputData[sIdx + 1] = pixels[i].g;
              outputData[sIdx + 2] = pixels[i].b;
            }
          }
          sortStart = -1;
        }
      }
    }
  }
}
