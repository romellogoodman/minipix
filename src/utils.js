// Utility function to remap a number from one range to another
export const map = (value, start1, stop1, start2, stop2, withinBounds = false) => {
  const mapped = start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));

  if (!withinBounds) {
    return mapped;
  }

  if (start2 < stop2) {
    return Math.max(Math.min(mapped, stop2), start2);
  } else {
    return Math.max(Math.min(mapped, start2), stop2);
  }
};

// Utility function to generate a random integer between min and max (inclusive)
export const randomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
