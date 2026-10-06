import { useState } from "react";

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

// Variation code field: shows the current code; pasting or typing one and
// pressing Enter (or leaving the field) loads it. `parse` returns null for text
// that isn't a code. Key it by code in the parent so it resets on outside changes.
export function CodeInput({ code, parse, onCommit }) {
  const [text, setText] = useState(code);
  const valid = parse(text) !== null;

  const commit = () => {
    if (!valid) setText(code);
    else if (text.trim().toLowerCase() !== code) onCommit(parse(text));
  };

  return (
    <input
      className={`input input--code${valid ? "" : " input--invalid"}`}
      aria-label="Variation code"
      title="The code for this exact image. Paste one here to load it."
      value={text}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(code);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
