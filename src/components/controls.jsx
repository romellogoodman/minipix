import { useState } from "react";
import { generateSeedHash, parseSeed } from "../utils/download.js";

export function Field({ label, aside, hint, children }) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{label}</span>
        {aside && <span className="field__aside">{aside}</span>}
      </div>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

// Seed text field: shows the base36 hash, commits on Enter or blur. Key it by
// hash in the parent so it resets whenever the seed changes elsewhere.
export function SeedInput({ hash, onCommit }) {
  const [text, setText] = useState(hash);
  const valid = parseSeed(text) !== null;

  const commit = () => {
    const seed = parseSeed(text);
    if (seed === null) setText(hash);
    else if (generateSeedHash(seed) !== hash) onCommit(seed);
  };

  return (
    <input
      className={`input${valid ? "" : " input--invalid"}`}
      aria-label="Seed"
      value={text}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(hash);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
