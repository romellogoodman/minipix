import { rendererConfig } from "../renderers";
import { generateSeedHash, buildFilename, parseSeed } from "./download.js";

// Every renderer, in config order. Its keys define the random selection pool.
export const ALL_RENDERERS = Object.keys(rendererConfig);

export const randomSeed = () => Math.floor(Math.random() * 0xffffffff);

// ?renderer= from a shared link: the first valid renderer name, or null.
export const rendererFromUrl = () =>
  (new URLSearchParams(window.location.search).get("renderer") || "")
    .split(",")
    .map((name) => name.trim())
    .find((name) => ALL_RENDERERS.includes(name)) ?? null;

// ?seed= from a shared link: the base36 hash from a filename or a decimal seed.
export const seedFromUrl = () => parseSeed(new URLSearchParams(window.location.search).get("seed"));

// Everything a <Canvas> and the export buttons need for one output.
export function describe({ image, renderer, seed, index = 0 }) {
  const hash = generateSeedHash(seed);
  return {
    key: `${image.id}-${renderer.displayName}-${seed}-${index}`,
    image,
    seed,
    renderer,
    rendererName: renderer.displayName,
    hash,
    filename: buildFilename(image, renderer.displayName, hash, index),
  };
}

// Link that reproduces one output: ?renderer= and ?seed=.
export function shareLink(rendererName, hash) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("renderer", rendererName);
  url.searchParams.set("seed", hash);
  return url.toString();
}
