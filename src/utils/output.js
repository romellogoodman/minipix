import { rendererConfig } from "../renderers";
import { generateSeedHash, buildFilename, parseSeed } from "./download.js";

// Every renderer, in config order.
export const ALL_RENDERERS = Object.keys(rendererConfig);

export const randomSeed = () => Math.floor(Math.random() * 0xffffffff);

const param = (name) => new URLSearchParams(window.location.search).get(name);

// ?renderer= from a shared link: the first valid name of a comma-separated list.
export const rendererFromUrl = () =>
  (param("renderer") || "")
    .split(",")
    .map((name) => name.trim())
    .find((name) => ALL_RENDERERS.includes(name)) ?? null;

// ?seed= from a shared link: the base36 hash from a filename or a decimal seed.
export const seedFromUrl = () => parseSeed(param("seed"));

// Everything the stage canvas and the export buttons need for one output.
export function describe({ image, renderer, seed }) {
  const hash = generateSeedHash(seed);
  return {
    image,
    seed,
    renderer,
    rendererName: renderer.displayName,
    hash,
    filename: buildFilename(image, renderer.displayName, hash),
  };
}

// Link that reproduces one output: ?renderer= and ?seed=.
export function shareLink(rendererName, hash) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ renderer: rendererName, seed: hash }).toString();
  return url.toString();
}
