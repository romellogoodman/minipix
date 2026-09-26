import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";
import Canvas from "./Canvas";
import * as renderers from "./renderers";
import useImageLoader from "./hooks/useImageLoader";
import useDragAndDrop from "./hooks/useDragAndDrop";
import useExport from "./hooks/useExport.js";
import {
  ALL_RENDERERS,
  describe,
  randomSeed,
  rendererFromUrl,
  seedFromUrl,
} from "./utils/output.js";
import { Upload } from "feather-icons-react";
import { Field, SeedInput } from "./components/controls.jsx";
import { generateSeedHash, parseSeed } from "./utils/download.js";
import {
  DESCRIPTIONS,
  buildConfig,
  formatValue,
  paramSpecs,
  rendererGroups,
} from "./catalog.js";

const HISTORY_SIZE = 12;
const COMMIT_DELAY = 400; // ms a draft must sit still before it joins the filmstrip
const RENDER_DELAY = 180; // ms of slider settling before re-rendering the stage
const THUMB_SIZE = 160;

const GROUPS = rendererGroups(ALL_RENDERERS);

// Stable identity for a variation: used for history dedupe and thumbnail lookup.
const variationKey = (v) =>
  v ? JSON.stringify([v.imageId, v.renderer, v.seed, v.overrides]) : "";

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const { allImages, availableImages, loadFiles } = useImageLoader();
  const { isDragging } = useDragAndDrop(loadFiles);
  const { status, flash, download, copyImage, copyLink } = useExport();

  const [wellEl, setWellEl] = useState(null);
  const [wellSize, setWellSize] = useState({ width: 0, height: 0 });
  const settingsInputRef = useRef(null);
  // Remembers each renderer's pins so switching away and back restores them.
  const pinsByRenderer = useRef({});

  // Initial renderer: ?renderer= (first valid name) if present, else random.
  const [initialRenderer] = useState(
    () => rendererFromUrl() ?? ALL_RENDERERS[Math.floor(Math.random() * ALL_RENDERERS.length)]
  );
  const [initialSeed] = useState(() => seedFromUrl() ?? randomSeed());

  // The variation being edited. Null until the user changes something, in
  // which case it falls back to the first available image.
  const [draftState, setDraftState] = useState(null);
  const firstImage = availableImages[0] || allImages[0];
  const firstImageId = firstImage?.id;
  const initialDraft = useMemo(
    () =>
      firstImageId === undefined
        ? null
        : { imageId: firstImageId, renderer: initialRenderer, seed: initialSeed, overrides: {} },
    [firstImageId, initialRenderer, initialSeed]
  );
  const draft = draftState ?? initialDraft;

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [thumbs, setThumbs] = useState({});
  const [lockSeed, setLockSeed] = useState(false);
  const [exported, setExported] = useState({ key: null, canvas: null });

  const updateDraft = useCallback(
    (fn) => setDraftState((prev) => fn(prev ?? draft)),
    [draft]
  );

  // A fresh upload becomes the source. The first load (the example images)
  // doesn't count, so the initial source stays the first example.
  const imageCount = useRef(0);
  useEffect(() => {
    const previous = imageCount.current;
    imageCount.current = allImages.length;
    if (previous > 0 && allImages.length > previous) {
      const newest = allImages[allImages.length - 1];
      updateDraft((d) => ({ ...d, imageId: newest.id }));
    }
  }, [allImages, updateDraft]);

  // Every settled draft joins the filmstrip (newest on the right).
  useEffect(() => {
    if (!draft) return;
    const key = variationKey(draft);
    const timer = setTimeout(() => {
      if (key === variationKey(history[historyIndex])) return;
      const next = [...history, draft].slice(-HISTORY_SIZE);
      setHistory(next);
      setHistoryIndex(next.length - 1);
    }, COMMIT_DELAY);
    return () => clearTimeout(timer);
  }, [draft, history, historyIndex]);

  useEffect(() => {
    if (!wellEl) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setWellSize({ width, height });
    });
    observer.observe(wellEl);
    return () => observer.disconnect();
  }, [wellEl]);

  // Slider drags re-render the stage only once they settle.
  const rendered = useDebounced(draft, RENDER_DELAY) ?? draft;
  const renderKey = variationKey(rendered);
  const renderedImage = rendered && allImages.find((img) => img.id === rendered.imageId);
  const output = useMemo(
    () =>
      rendered && renderedImage
        ? describe({ image: renderedImage, renderer: renderers[rendered.renderer], seed: rendered.seed })
        : null,
    [rendered, renderedImage]
  );
  // Memoized on content so <Canvas> only re-renders when a pin actually changes.
  const renderConfig = useMemo(
    () => (rendered ? buildConfig(rendered.renderer, rendered.overrides) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderKey]
  );

  const exportCanvas = exported.key === renderKey ? exported.canvas : null;

  // Keep the finished canvas for export and snapshot a small thumbnail of it
  // for the filmstrip, instead of rendering every history entry again.
  const handleRendered = useCallback(
    (canvas) => {
      setExported({ key: renderKey, canvas });
      const scale = THUMB_SIZE / Math.max(canvas.width, canvas.height);
      const thumb = document.createElement("canvas");
      thumb.width = Math.max(1, Math.round(canvas.width * scale));
      thumb.height = Math.max(1, Math.round(canvas.height * scale));
      thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
      const url = thumb.toDataURL("image/jpeg", 0.8);
      setThumbs((prev) => ({ ...prev, [renderKey]: url }));
    },
    [renderKey]
  );

  const selectRenderer = (name) => {
    if (!draft) return;
    pinsByRenderer.current[draft.renderer] = draft.overrides;
    setDraftState({
      ...draft,
      renderer: name,
      seed: lockSeed ? draft.seed : randomSeed(),
      overrides: pinsByRenderer.current[name] || {},
    });
  };

  // New seed and every parameter back to auto, so the whole variation changes.
  const reroll = useCallback(
    () => updateDraft((d) => ({ ...d, seed: randomSeed(), overrides: {} })),
    [updateDraft]
  );

  const setPin = (key, value) =>
    updateDraft((d) => ({ ...d, overrides: { ...d.overrides, [key]: value } }));

  const clearPin = (key) =>
    updateDraft((d) => {
      const overrides = { ...d.overrides };
      delete overrides[key];
      return { ...d, overrides };
    });

  const restore = useCallback(
    (index) => {
      const entry = history[index];
      if (!entry) return;
      setDraftState(entry);
      setHistoryIndex(index);
    },
    [history]
  );

  const saveSettings = () => {
    if (!draft) return;
    const image = allImages.find((img) => img.id === draft.imageId);
    const settings = {
      renderer: draft.renderer,
      seed: draft.seed,
      hash: output?.hash,
      image: image?.filename ?? null,
      overrides: draft.overrides,
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (output?.filename ?? "minipix").replace(/\.\w+$/, "") + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const loadSettings = async (file) => {
    try {
      const settings = JSON.parse(await file.text());
      if (!ALL_RENDERERS.includes(settings.renderer)) throw new Error("unknown renderer");
      const seed =
        typeof settings.seed === "number" ? settings.seed >>> 0 : parseSeed(settings.seed ?? settings.hash);
      if (seed === null) throw new Error("bad seed");
      const known = new Set(paramSpecs(settings.renderer).map((s) => s.key));
      const overrides = Object.fromEntries(
        Object.entries(settings.overrides || {}).filter(([key]) => known.has(key))
      );
      const image = allImages.find((img) => img.filename === settings.image);
      updateDraft((d) => ({
        imageId: image ? image.id : d.imageId,
        renderer: settings.renderer,
        seed,
        overrides,
      }));
      flash(
        image || !settings.image
          ? "Settings loaded"
          : `Settings loaded · ${settings.image} not found, kept current source`
      );
    } catch {
      flash("Couldn't read that settings file");
    }
  };

  // Keyboard: R reroll, D download, ←/→ step through the filmstrip.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.("input, select, textarea")) return;
      if (e.key === "r") reroll();
      else if (e.key === "d") download(exportCanvas, output);
      else if (e.key === "ArrowLeft") {
        e.preventDefault();
        restore(Math.max(historyIndex - 1, 0));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        restore(Math.min(historyIndex + 1, history.length - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reroll, download, exportCanvas, output, restore, historyIndex, history.length]);

  const specs = draft ? paramSpecs(draft.renderer) : [];
  const pinnedCount = draft ? Object.keys(draft.overrides).length : 0;
  const sourceMime = output?.image.mimeType === "image/jpeg" ? "JPG" : "PNG";

  return (
    <div className="app app--studio">
      {isDragging && (
        <div className="dropzone-overlay">
          <div className="dropzone-overlay__content">Drop images to add them</div>
        </div>
      )}
      <main className="studio">
        <div className="studio__stage">
          <div ref={setWellEl} className="studio__well">
            {output ? (
              <Canvas
                key={renderKey}
                image={output.image.element}
                renderFn={output.renderer}
                seed={output.seed}
                config={renderConfig}
                rendererName={output.rendererName}
                hash={output.hash}
                maxWidth={Math.max(wellSize.width, 100)}
                maxHeight={Math.max(wellSize.height, 100)}
                scrollRoot={wellEl}
                onRendered={handleRendered}
              />
            ) : (
              <p className="studio__empty">Add a source image to start.</p>
            )}
          </div>

          <ol className="studio__strip" aria-label="Recent variations">
            {Array.from({ length: HISTORY_SIZE }, (_, i) => {
              const entry = history[i];
              if (!entry) return <li key={`empty-${i}`} className="studio__frame studio__frame--empty" />;
              const key = variationKey(entry);
              return (
                <li key={`${i}-${key}`} className="studio__frame">
                  <button
                    type="button"
                    className={`studio__thumb${i === historyIndex ? " studio__thumb--current" : ""}`}
                    onClick={() => restore(i)}
                    title={`${entry.renderer} · ${generateSeedHash(entry.seed)}`}
                    aria-label={`Restore ${entry.renderer} variation ${i + 1}`}
                    aria-current={i === historyIndex ? "true" : undefined}
                    style={thumbs[key] ? { backgroundImage: `url(${thumbs[key]})` } : undefined}
                  >
                    {!thumbs[key] && <span className="studio__thumb-name">{entry.renderer}</span>}
                  </button>
                </li>
              );
            })}
          </ol>

          <p className="studio__hint">
            R reroll · D download · ← → step through history · Drop images anywhere
          </p>
        </div>

        <aside className="studio__panel">
          <Field label={<Step n={1}>Source</Step>}>
            <SourcePicker
              images={allImages}
              selectedId={draft?.imageId}
              dragging={isDragging}
              onSelect={(imageId) => updateDraft((d) => ({ ...d, imageId }))}
              onFiles={loadFiles}
            />
          </Field>

          <Field label={<Step n={2}>Renderer</Step>} hint={draft && DESCRIPTIONS[draft.renderer]}>
            {draft && <GroupedSelect value={draft.renderer} groups={GROUPS} onChange={selectRenderer} />}
          </Field>

          <Field
            label={<Step n={3}>Variation</Step>}
            aside={pinnedCount > 0 ? `${pinnedCount} pinned` : null}
          >
            {draft && (
              <SeedInput
                label={null}
                key={output?.hash ?? draft.seed}
                hash={output?.hash ?? ""}
                onCommit={(seed) => updateDraft((d) => ({ ...d, seed }))}
              />
            )}
            <div className="row">
              <button type="button" className="btn" onClick={reroll} disabled={!draft}>
                Reroll
              </button>
              <label className="studio__toggle">
                <input
                  type="checkbox"
                  checked={lockSeed}
                  onChange={(e) => setLockSeed(e.target.checked)}
                />
                <span className="studio__switch" aria-hidden="true" />
                Lock seed
              </label>
            </div>
            <span className="field__hint">
              Reroll picks a new seed and returns every parameter to auto.{" "}
              {lockSeed
                ? "Changing renderer keeps this seed."
                : "Changing renderer rolls a new seed."}
            </span>
            {specs.length > 0 && (
              <div className="studio__params">
                {specs.map((spec) => (
                  <ParamControl
                    key={`${draft.renderer}-${spec.key}`}
                    spec={spec}
                    value={draft.overrides[spec.key]}
                    onChange={(v) => setPin(spec.key, v)}
                    onReset={() => clearPin(spec.key)}
                  />
                ))}
              </div>
            )}
            {pinnedCount > 0 && (
              <div className="links">
                <button
                  type="button"
                  className="btn btn--text"
                  onClick={() => updateDraft((d) => ({ ...d, overrides: {} }))}
                >
                  Reset parameters
                </button>
              </div>
            )}
          </Field>

          <Field label={<Step n={4}>Export</Step>}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => download(exportCanvas, output)}
              disabled={!exportCanvas}
            >
              Download {sourceMime}
            </button>
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => copyImage(exportCanvas)}
                disabled={!exportCanvas}
              >
                Copy image
              </button>
              <button type="button" className="btn" onClick={() => copyLink(output)} disabled={!output}>
                Copy link
              </button>
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={saveSettings} disabled={!draft}>
                Save settings
              </button>
              <button type="button" className="btn" onClick={() => settingsInputRef.current?.click()}>
                Load settings
              </button>
            </div>
            <input
              ref={settingsInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) loadSettings(file);
                e.target.value = "";
              }}
            />
            {pinnedCount > 0 && (
              <span className="field__hint">
                Links carry renderer + seed only; save settings to keep pinned parameters.
              </span>
            )}
            <span className="field__status" role="status">
              {status}
            </span>
          </Field>
        </aside>
      </main>
    </div>
  );
}

// Source images as a row of thumbnails, led by an upload tile.
function SourcePicker({ images, selectedId, dragging, onSelect, onFiles }) {
  const inputRef = useRef(null);
  return (
    <div className="studio__sources" role="radiogroup" aria-label="Source image">
      <button
        type="button"
        className={`studio__source studio__source--upload${dragging ? " studio__source--over" : ""}`}
        onClick={() => inputRef.current?.click()}
        aria-label="Upload images"
        title="Upload or drop images"
      >
        <Upload size={16} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png, image/jpeg"
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      {images.map((img) => (
        <button
          key={img.id}
          type="button"
          role="radio"
          aria-checked={img.id === selectedId}
          aria-label={img.filename || `Image ${img.id + 1}`}
          title={img.filename}
          className={`studio__source${img.id === selectedId ? " studio__source--current" : ""}`}
          style={{ backgroundImage: `url(${img.element.src})` }}
          onClick={() => onSelect(img.id)}
        />
      ))}
    </div>
  );
}

function Step({ n, children }) {
  return (
    <span className="studio__step-label">
      <span className="studio__step">{n}</span>
      {children}
    </span>
  );
}

function GroupedSelect({ value, groups, onChange }) {
  return (
    <label className="select">
      <select className="select__native" value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="select__chevron" />
    </label>
  );
}

// One parameter. Untouched ("auto") it shows the renderer's own random range;
// moving the slider pins it.
function ParamControl({ spec, value, onChange, onReset }) {
  const pinned = value !== undefined;
  const label = (
    <span className="studio__param-head">
      <span className="studio__param-name">{spec.key}</span>
      <span className="studio__param-value">{describeValue(spec, value)}</span>
      {pinned ? (
        <button type="button" className="studio__param-reset" onClick={onReset} title="Back to auto">
          reset
        </button>
      ) : (
        <span className="studio__param-auto">auto</span>
      )}
    </span>
  );

  if (spec.kind === "span") {
    const span = value ?? spec.auto;
    return (
      <div className={`studio__param${pinned ? " studio__param--pinned" : ""}`}>
        {label}
        <SpanSlider spec={spec} label="outer" value={span.max} onChange={(v) => onChange({ ...span, max: v })} />
        <SpanSlider spec={spec} label="inner" value={span.min} onChange={(v) => onChange({ ...span, min: v })} />
      </div>
    );
  }

  const shown = pinned ? value : autoMidpoint(spec);
  return (
    <label className={`studio__param${pinned ? " studio__param--pinned" : ""}`}>
      {label}
      <input
        className="slider__input"
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={shown}
        aria-label={spec.key}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function SpanSlider({ spec, label, value, onChange }) {
  return (
    <span className="studio__span">
      <span className="studio__span-label">{label}</span>
      <input
        className="slider__input"
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        aria-label={`${spec.key} ${label}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </span>
  );
}

function autoMidpoint(spec) {
  if (spec.kind === "range") {
    const mid = (spec.auto.min + spec.auto.max) / 2;
    return spec.int ? Math.round(mid) : mid;
  }
  return spec.auto;
}

function describeValue(spec, value) {
  if (spec.kind === "span") {
    const span = value ?? spec.auto;
    return `${formatValue(span.max, spec)} → ${formatValue(span.min, spec)}`;
  }
  if (value !== undefined) return formatValue(value, spec);
  if (spec.kind === "range") {
    return `${formatValue(spec.auto.min, spec)}–${formatValue(spec.auto.max, spec)}`;
  }
  return formatValue(spec.auto, spec);
}
