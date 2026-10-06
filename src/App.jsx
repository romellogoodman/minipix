import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";
import Canvas from "./Canvas";
import * as renderers from "./renderers";
import useImageLoader from "./hooks/useImageLoader";
import useDragAndDrop from "./hooks/useDragAndDrop";
import useExport from "./hooks/useExport.js";
import {
  ALL_RENDERERS,
  codeFromUrl,
  describe,
  randomSeed,
  rendererFromUrl,
} from "./utils/output.js";
import { Dices, Upload } from "./components/icons.jsx";
import { CodeInput, Field } from "./components/controls.jsx";
import {
  DESCRIPTIONS,
  buildConfig,
  formatValue,
  paramSpecs,
  parseVariationCode,
  randomParamValue,
  rendererGroups,
  variationCode,
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
  const { images, loadFiles } = useImageLoader();
  const { isDragging } = useDragAndDrop(loadFiles);
  const { status, download, copyImage, copyLink } = useExport();

  const [wellEl, setWellEl] = useState(null);
  const [wellSize, setWellSize] = useState({ width: 0, height: 0 });
  // Remembers each renderer's pins so switching away and back restores them.
  const pinsByRenderer = useRef({});

  // Initial renderer: ?renderer= (first valid name) if present, else random.
  const [initialRenderer] = useState(
    () => rendererFromUrl() ?? ALL_RENDERERS[Math.floor(Math.random() * ALL_RENDERERS.length)]
  );
  // Initial seed and pins: ?seed= (a variation code) if present, else a fresh seed.
  const [initialVariation] = useState(
    () => parseVariationCode(codeFromUrl(), initialRenderer) ?? { seed: randomSeed(), overrides: {} }
  );

  // The variation being edited. Until the user changes something it is derived
  // from the first image and the URL params.
  const [draftState, setDraftState] = useState(null);
  const firstImageId = images[0]?.id;
  const initialDraft = useMemo(
    () =>
      firstImageId === undefined
        ? null
        : { imageId: firstImageId, renderer: initialRenderer, ...initialVariation },
    [firstImageId, initialRenderer, initialVariation]
  );
  const draft = draftState ?? initialDraft;

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [thumbs, setThumbs] = useState({});
  const [exported, setExported] = useState({ key: null, canvas: null });
  // Parameter values the last finished render drew, for the sliders to show.
  const [drawn, setDrawn] = useState({ renderer: null, seed: null, values: {} });

  const updateDraft = useCallback(
    (fn) => setDraftState((prev) => fn(prev ?? draft)),
    [draft]
  );

  // A fresh upload becomes the source. The first load (the example images)
  // doesn't count, so the initial source stays the first example.
  const imageCount = useRef(0);
  useEffect(() => {
    const previous = imageCount.current;
    imageCount.current = images.length;
    if (previous > 0 && images.length > previous) {
      const newest = images[images.length - 1];
      updateDraft((d) => ({ ...d, imageId: newest.id }));
    }
  }, [images, updateDraft]);

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
  const renderedImage = rendered && images.find((img) => img.id === rendered.imageId);
  const output = useMemo(
    () =>
      rendered && renderedImage
        ? describe({
            image: renderedImage,
            renderer: renderers[rendered.renderer],
            seed: rendered.seed,
            overrides: rendered.overrides,
          })
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
    (canvas, values) => {
      setExported({ key: renderKey, canvas });
      setDrawn({ renderer: rendered.renderer, seed: rendered.seed, values });
      const scale = THUMB_SIZE / Math.max(canvas.width, canvas.height);
      const thumb = document.createElement("canvas");
      thumb.width = Math.max(1, Math.round(canvas.width * scale));
      thumb.height = Math.max(1, Math.round(canvas.height * scale));
      thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
      const url = thumb.toDataURL("image/jpeg", 0.8);
      setThumbs((prev) => ({ ...prev, [renderKey]: url }));
    },
    [renderKey, rendered]
  );

  const selectRenderer = (name) => {
    if (!draft) return;
    pinsByRenderer.current[draft.renderer] = draft.overrides;
    setDraftState({
      ...draft,
      renderer: name,
      seed: randomSeed(),
      overrides: pinsByRenderer.current[name] || {},
    });
  };

  // A different renderer at random.
  const rerollRenderer = () => {
    if (!draft) return;
    const others = ALL_RENDERERS.filter((name) => name !== draft.renderer);
    selectRenderer(others[Math.floor(Math.random() * others.length)]);
  };

  // New seed: everything that isn't pinned changes; pinned parameters stay.
  const reroll = useCallback(() => updateDraft((d) => ({ ...d, seed: randomSeed() })), [updateDraft]);

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
  // What the current seed drew, once a render of this renderer + seed has finished.
  const drawnValues =
    draft && drawn.renderer === draft.renderer && drawn.seed === draft.seed ? drawn.values : {};
  const pinnedCount = draft ? Object.keys(draft.overrides).length : 0;
  const sourceMime = output?.image.mimeType === "image/jpeg" ? "JPG" : "PNG";

  return (
    <div className="app">
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
                label={`${output.rendererName} rendering, variation ${output.code}`}
                maxWidth={Math.max(wellSize.width, 100)}
                maxHeight={Math.max(wellSize.height, 100)}
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
                    title={`${entry.renderer} · ${variationCode(entry.seed, entry.renderer, entry.overrides)}`}
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
              images={images}
              selectedId={draft?.imageId}
              dragging={isDragging}
              onSelect={(imageId) => updateDraft((d) => ({ ...d, imageId }))}
              onFiles={loadFiles}
            />
          </Field>

          <Field label={<Step n={2}>Renderer</Step>} hint={draft && DESCRIPTIONS[draft.renderer]}>
            {draft && (
              <div className="row row--trailing">
                <GroupedSelect value={draft.renderer} groups={GROUPS} onChange={selectRenderer} />
                <button
                  type="button"
                  className="btn btn--icon btn--square"
                  onClick={rerollRenderer}
                  title="Random renderer"
                  aria-label="Random renderer"
                >
                  <Dices size={18} />
                </button>
              </div>
            )}
          </Field>

          <Field
            label={<Step n={3}>Variation</Step>}
            aside={
              <span className="studio__actions">
                {pinnedCount > 0 && (
                  <button
                    type="button"
                    className="btn btn--text"
                    onClick={() => updateDraft((d) => ({ ...d, overrides: {} }))}
                  >
                    Reset {pinnedCount} pinned
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--icon btn--square studio__reroll"
                  onClick={reroll}
                  disabled={!draft}
                  title="Reroll (R)"
                  aria-label="Reroll"
                >
                  <Dices size={18} />
                </button>
              </span>
            }
            hint={pinnedCount > 0 ? "Reroll changes everything except pinned settings." : null}
          >
            {specs.length > 0 && (
              <div className="studio__params">
                {specs.map((spec) => (
                  <ParamControl
                    key={`${draft.renderer}-${spec.key}`}
                    spec={spec}
                    value={draft.overrides[spec.key]}
                    drawn={drawnValues[spec.key]}
                    onChange={(v) => setPin(spec.key, v)}
                    onReroll={() => setPin(spec.key, randomParamValue(spec))}
                    onReset={() => clearPin(spec.key)}
                  />
                ))}
              </div>
            )}
          </Field>

          <Field
            label={<Step n={4}>Export</Step>}
            aside={
              output && (
                <CodeInput
                  key={output.code}
                  code={output.code}
                  parse={(text) => parseVariationCode(text, draft.renderer)}
                  onCommit={({ seed, overrides }) => updateDraft((d) => ({ ...d, seed, overrides }))}
                />
              )
            }
          >
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

// One parameter. On auto it shows what the current seed picked (a dimmed
// thumb), or the range it picks from until a render reports back. Dragging,
// rerolling or choosing On / Off pins it.
function ParamControl({ spec, value, drawn, onChange, onReroll, onReset }) {
  const pinned = value !== undefined;
  const reset = pinned && (
    <button type="button" className="studio__param-reset" onClick={onReset} title="Back to auto">
      reset
    </button>
  );

  // A chance only ever plays out as yes or no in one image, so it's a switch.
  if (spec.kind === "probability") {
    const choice = !pinned ? "auto" : value >= 0.5 ? "on" : "off";
    const pick = (option) => (option === "auto" ? onReset() : onChange(option === "on" ? 1 : 0));
    return (
      <div className="studio__param studio__param--choice">
        <span className="studio__param-name" id={`param-${spec.key}`}>
          {spec.label}
        </span>
        <span className="segmented" role="radiogroup" aria-labelledby={`param-${spec.key}`}>
          {["auto", "on", "off"].map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={choice === option}
              className={`segmented__option${choice === option ? " segmented__option--current" : ""}`}
              onClick={() => pick(option)}
            >
              {option === "auto" ? "Auto" : option === "on" ? "On" : "Off"}
            </button>
          ))}
        </span>
      </div>
    );
  }

  const head = (
    <span className="studio__param-head">
      <span className="studio__param-name">{spec.label}</span>
      <span className="studio__param-value">{describeValue(spec, value, drawn)}</span>
      <button
        type="button"
        className="studio__param-reroll"
        onClick={onReroll}
        title={`Random ${spec.label.toLowerCase()}`}
        aria-label={`Random ${spec.label.toLowerCase()}`}
      >
        <Dices size={14} />
      </button>
      {reset}
    </span>
  );
  const className = `studio__param${pinned ? " studio__param--pinned" : ""}`;

  if (spec.kind === "span") {
    const span = value ?? spec.auto;
    return (
      <div className={className}>
        {head}
        <SpanSlider spec={spec} label="outer" value={span.max} onChange={(v) => onChange({ ...span, max: v })} />
        <SpanSlider spec={spec} label="inner" value={span.min} onChange={(v) => onChange({ ...span, min: v })} />
      </div>
    );
  }

  const known = pinned || typeof drawn === "number" || spec.kind === "number";
  const shown = pinned ? value : typeof drawn === "number" ? drawn : autoMidpoint(spec);
  return (
    <label className={`${className}${known ? "" : " studio__param--unknown"}`}>
      {head}
      <input
        className="slider__input"
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={shown}
        aria-label={spec.label}
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
        aria-label={`${spec.label} ${label}`}
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

function describeValue(spec, value, drawn) {
  if (spec.kind === "span") {
    const span = value ?? spec.auto;
    return `${formatValue(span.max, spec)} → ${formatValue(span.min, spec)}`;
  }
  if (value !== undefined) return formatValue(value, spec);
  if (typeof drawn === "number") return formatValue(drawn, spec);
  if (spec.kind === "range") {
    return `${formatValue(spec.auto.min, spec)}–${formatValue(spec.auto.max, spec)}`;
  }
  return formatValue(spec.auto, spec);
}
