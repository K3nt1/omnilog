"use client";

import { useId, useState } from "react";

/** Comparaison sans accents ni majuscules (« Ciné » trouve « cinoche »). */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MAX_TAGS = 30;
const MAX_SUGGESTIONS = 8;

/**
 * Champ de tags à la Letterboxd : chaque tag devient une pastille, et la saisie propose tes tags existants
 * (filtrés par ce que tu tapes, les plus utilisés d'abord). Entrée, virgule ou Tab valident ; Retour arrière
 * retire le dernier tag ; ↑ ↓ choisissent une suggestion.
 */
export function TagInput({ value, onChange, known }: { value: string[]; onChange: (tags: string[]) => void; known: string[] }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const typed = fold(text.trim());
  const taken = new Set(value.map(fold));
  const available = known.filter((t) => !taken.has(fold(t)));
  // Ce qui commence par la saisie d'abord, puis ce qui la contient ; sans saisie, les plus utilisés.
  const suggestions = typed
    ? [...available.filter((t) => fold(t).startsWith(typed)), ...available.filter((t) => !fold(t).startsWith(typed) && fold(t).includes(typed))]
    : available;
  const shown = suggestions.slice(0, MAX_SUGGESTIONS);
  const exact = typed && (taken.has(typed) || known.some((t) => fold(t) === typed));

  function add(tag: string) {
    const t = tag.trim().replace(/^#/, "");
    if (!t || taken.has(fold(t)) || value.length >= MAX_TAGS) return setText("");
    // Un tag existant garde son écriture (« VO » reste « VO » même tapé « vo »).
    const existing = known.find((k) => fold(k) === fold(t));
    onChange([...value, (existing ?? t).slice(0, 60)]);
    setText("");
    setActive(0);
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 focus-within:border-white/40">
        {value.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded bg-white/10 py-0.5 pl-1.5 pr-1 text-xs">
            #{tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Retirer le tag ${tag}`}
              className="rounded px-0.5 text-white/50 hover:text-white"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            // Une virgule tapée ou collée valide ce qui précède.
            if (v.includes(",")) {
              const parts = v.split(",");
              parts.slice(0, -1).forEach(add);
              setText(parts.at(-1) ?? "");
            } else setText(v);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && shown.length > 0) {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % shown.length);
            } else if (e.key === "ArrowUp" && shown.length > 0) {
              e.preventDefault();
              setActive((a) => (a - 1 + shown.length) % shown.length);
            } else if (e.key === "Enter" || (e.key === "Tab" && text.trim())) {
              if (!text.trim() && e.key === "Enter") return;
              e.preventDefault();
              add(open && shown[active] && typed && !exact ? shown[active] : text);
            } else if (e.key === "Backspace" && !text && value.length > 0) {
              onChange(value.slice(0, -1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={value.length === 0 ? "Tags (vo, cinéma…) : tape pour voir tes tags" : ""}
          aria-label="Tags"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          className="min-w-32 flex-1 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>
      {open && (shown.length > 0 || (typed && !exact)) && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg bg-neutral-900 py-1 text-sm shadow-xl ring-1 ring-white/15">
          {shown.map((tag, i) => (
            <li key={tag} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(tag)}
                onMouseEnter={() => setActive(i)}
                className={`w-full px-3 py-1.5 text-left ${i === active ? "bg-white/10" : ""}`}
              >
                #{tag}
              </button>
            </li>
          ))}
          {typed && !exact && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(text)}
                className="w-full px-3 py-1.5 text-left text-sky-300 hover:bg-white/10"
              >
                + Nouveau tag « {text.trim().replace(/^#/, "")} »
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
