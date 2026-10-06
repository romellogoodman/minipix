import { rendererConfig } from "../renderers";
import { buildFilename } from "./download.js";
import { variationCode } from "../catalog.js";

// Every renderer, in config order.
export const ALL_RENDERERS = Object.keys(rendererConfig);

export const randomSeed = () => Math.floor(Math.random() * 0x100000000);

const param = (name) => new URLSearchParams(window.location.search).get(name);

// ?renderer= from a shared link: the first valid name of a comma-separated list.
export const rendererFromUrl = () =>
  (param("renderer") || "")
    .split(",")
    .map((name) => name.trim())
    .find((name) => ALL_RENDERERS.includes(name)) ?? null;

// ?seed= from a shared link: a variation code (see catalog.js), a filename's
// hash, or a decimal seed. Parsed by the caller once the renderer is known.
export const codeFromUrl = () => param("seed");

// Everything the stage canvas and the export buttons need for one output.
export function describe({ image, renderer, seed, overrides }) {
  const code = variationCode(seed, renderer.displayName, overrides);
  return {
    image,
    seed,
    renderer,
    rendererName: renderer.displayName,
    code,
    filename: buildFilename(image, renderer.displayName, code),
  };
}

// Link that reproduces one output, pinned parameters included.
export function shareLink(rendererName, code) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ renderer: rendererName, seed: code }).toString();
  return url.toString();
}
