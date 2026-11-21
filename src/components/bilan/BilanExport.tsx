"use client";

import { useEffect, useRef, useState } from "react";
import {
  hoursLabel,
  mainFigure,
  MONTHS_FR,
  MONTHS_SHORT,
  shortDay,
  TYPE_HEX,
  WEEKDAYS_FR,
  AGAIN_LABEL,
  type BilanData,
  type BilanWork,
} from "@/lib/bilan-shared";
import { starsLabel, TYPE_LABELS } from "@/lib/labels";
import type { MediaType } from "@/lib/types";

type Card = "resume" | "top" | "records" | "type" | "mois";
type Style = "neon" | "pastel" | "minimal";
type Format = "story" | "square";

const CARDS: [Card, string][] = [
  ["resume", "Résumé"],
  ["top", "Top de l'année"],
  ["records", "Records"],
  ["type", "Par type"],
  ["mois", "Mois par mois"],
];
const STYLES: [Style, string][] = [
  ["neon", "Sombre néon"],
  ["pastel", "Pastel"],
  ["minimal", "Clair minimal"],
];
const FORMATS: [Format, string][] = [
  ["story", "Story 9:16"],
  ["square", "Carré"],
];

interface Theme {
  text: string;
  sub: string;
  accent: string;
  panel: string;
  background(ctx: CanvasRenderingContext2D, w: number, h: number): void;
}

const THEMES: Record<Style, Theme> = {
  neon: {
    text: "#ffffff",
    sub: "rgba(255,255,255,0.62)",
    accent: "#22d3ee",
    panel: "rgba(255,255,255,0.07)",
    background(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#1a0b33");
      g.addColorStop(1, "#04040a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (const [x, y, r, c] of [
        [0.1, 0.08, 0.55, "rgba(236,72,153,0.45)"],
        [0.95, 0.55, 0.6, "rgba(34,211,238,0.30)"],
        [0.2, 0.98, 0.5, "rgba(139,92,246,0.35)"],
      ] as const) {
        const radial = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
        radial.addColorStop(0, c);
        radial.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, w, h);
      }
    },
  },
  pastel: {
    text: "#2e2745",
    sub: "rgba(46,39,69,0.62)",
    accent: "#8b5cf6",
    panel: "rgba(255,255,255,0.55)",
    background(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#ffe4ec");
      g.addColorStop(0.5, "#e0f2fe");
      g.addColorStop(1, "#ede9fe");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },
  minimal: {
    text: "#0f172a",
    sub: "#64748b",
    accent: "#0f172a",
    panel: "#eef2f7",
    background(ctx, w, h) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0.074 * w, 0.06 * h, 0.12 * w, 6);
    },
  },
};

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Affiches chargées via Omnilog (même origine : l'image reste exportable). */
const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadPoster(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  if (!images.has(url)) {
    images.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `/api/poster?u=${encodeURIComponent(url)}`;
      }),
    );
  }
  return images.get(url)!;
}

class Painter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly w: number,
    readonly h: number,
    readonly theme: Theme,
  ) {}
  get u() {
    return this.w / 1080;
  }
  text(value: string, x: number, y: number, size: number, opts: { color?: string; weight?: number; align?: CanvasTextAlign; max?: number } = {}) {
    const { ctx } = this;
    let px = size * this.u;
    ctx.font = `${opts.weight ?? 400} ${px}px ${FONT}`;
    let shown = value;
    if (opts.max) {
      // Réduit un peu la taille, puis coupe avec « … » si le texte reste trop long.
      while (ctx.measureText(shown).width > opts.max * this.u && px > size * this.u * 0.75) {
        px -= 2;
        ctx.font = `${opts.weight ?? 400} ${px}px ${FONT}`;
      }
      while (ctx.measureText(shown).width > opts.max * this.u && shown.length > 1) shown = `${shown.slice(0, -2)}…`;
    }
    ctx.fillStyle = opts.color ?? this.theme.text;
    ctx.textAlign = opts.align ?? "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(shown, x * this.u, y * this.u);
  }
  rect(x: number, y: number, w: number, h: number, color: string, radius = 24) {
    const { ctx, u } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x * u, y * u, w * u, h * u, radius * u);
    ctx.fill();
  }
  async poster(work: BilanWork | null, x: number, y: number, w: number) {
    const h = w * 1.5;
    this.rect(x, y, w, h, this.theme.panel, 14);
    const img = await loadPoster(work?.posterUrl ?? null);
    if (!img) return;
    const { ctx, u } = this;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x * u, y * u, w * u, h * u, 14 * u);
    ctx.clip();
    // Recadrage façon « cover ».
    const ratio = Math.max((w * u) / img.width, (h * u) / img.height);
    const dw = img.width * ratio;
    const dh = img.height * ratio;
    ctx.drawImage(img, x * u + (w * u - dw) / 2, y * u + (h * u - dh) / 2, dw, dh);
    ctx.restore();
  }
  dot(x: number, y: number, r: number, color: string) {
    const { ctx, u } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Hauteur logique (largeur 1080) du format. */
const heightOf = (format: Format) => (format === "story" ? 1920 : 1080);

async function paint(canvas: HTMLCanvasElement, bilan: BilanData, card: Card, style: Style, format: Format, type: MediaType) {
  const W = 1080;
  const H = heightOf(format);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const theme = THEMES[style];
  const p = new Painter(ctx, W, H, theme);
  theme.background(ctx, W, H);
  const story = format === "story";
  const left = 80;
  const width = W - 2 * left;
  let y = story ? 190 : 130;

  p.text(`OMNILOG · BILAN ${bilan.year}`, left, y, 30, { color: theme.sub, weight: 700 });
  y += story ? 110 : 80;

  if (card === "resume") {
    p.text(`Mon année ${bilan.year}`, left, y, story ? 84 : 66, { weight: 900 });
    y += story ? 190 : 120;
    p.text(hoursLabel(bilan.totals.minutes), left, y, story ? 170 : 120, { weight: 900, color: theme.accent });
    y += story ? 60 : 50;
    p.text("devant l'écran et la manette", left, y, 34, { color: theme.sub });
    y += story ? 110 : 70;
    const stats: [string, string][] = [
      [String(bilan.totals.works), "œuvres"],
      [String(bilan.totals.completed), "terminées"],
      [String(bilan.totals.activeDays), "jours actifs"],
    ];
    stats.forEach(([v, l], i) => {
      const x = left + i * (width / 3);
      p.text(v, x, y, story ? 72 : 58, { weight: 800 });
      p.text(l, x, y + 46, 30, { color: theme.sub });
    });
    y += story ? 140 : 100;
    const rows = bilan.types.slice(0, story ? 6 : 4);
    for (const t of rows) {
      const f = mainFigure(t);
      p.rect(left, y, width, story ? 108 : 78, theme.panel, 22);
      p.dot(left + 40, y + (story ? 54 : 39), 12, TYPE_HEX[t.type]);
      p.text(TYPE_LABELS[t.type], left + 72, y + (story ? 66 : 50), 36, { weight: 700, max: 360 });
      p.text(`${f.value} · ${f.label}`, left + width - 36, y + (story ? 66 : 50), 34, { align: "right", color: theme.sub, max: 520 });
      y += story ? 128 : 92;
    }
  }

  if (card === "top") {
    p.text("Mes mieux notées", left, y, story ? 84 : 66, { weight: 900 });
    y += story ? 80 : 50;
    const best = bilan.types.filter((t) => t.top.length > 0).slice(0, 6);
    if (story) {
      for (const t of best) {
        const w = t.top[0];
        await p.poster(w, left, y, 150);
        p.text(TYPE_LABELS[t.type].toUpperCase(), left + 190, y + 60, 26, { weight: 800, color: TYPE_HEX[t.type] });
        p.text(w.title, left + 190, y + 120, 44, { weight: 800, max: width - 190 });
        p.text(`★ ${starsLabel(w.rating)}`, left + 190, y + 175, 36, { color: theme.sub });
        y += 250;
      }
    } else {
      const cols = 3;
      const cw = (width - (cols - 1) * 30) / cols;
      for (const [i, t] of best.entries()) {
        const w = t.top[0];
        const x = left + (i % cols) * (cw + 30);
        const yy = y + Math.floor(i / cols) * 420;
        const pw = 170;
        await p.poster(w, x, yy, pw);
        p.text(TYPE_LABELS[t.type].toUpperCase(), x + pw + 18, yy + 40, 20, { weight: 800, color: TYPE_HEX[t.type], max: cw - pw - 18 });
        p.text(`★ ${starsLabel(w.rating)}`, x + pw + 18, yy + 82, 30, { weight: 700 });
        p.text(w.title, x, yy + 300, 28, { weight: 700, max: cw });
      }
    }
  }

  if (card === "records") {
    p.text("Mes records", left, y, story ? 84 : 66, { weight: 900 });
    y += story ? 120 : 70;
    const blocks: [string, string, string][] = [
      ["Mois le plus chargé", bilan.busiestMonth ? MONTHS_FR[bilan.busiestMonth.month] : "—", bilan.busiestMonth ? `${bilan.busiestMonth.activities} activités` : ""],
      ["Jour préféré", bilan.busiestWeekday ? WEEKDAYS_FR[bilan.busiestWeekday.weekday] : "—", bilan.busiestWeekday ? `${bilan.busiestWeekday.activities} activités` : ""],
      [
        "Plus longue série",
        `${bilan.streak.days} jour${bilan.streak.days > 1 ? "s" : ""}`,
        bilan.streak.from && bilan.streak.to ? `${shortDay(bilan.streak.from)} → ${shortDay(bilan.streak.to)}` : "",
      ],
    ];
    const bh = story ? 250 : 200;
    for (const [label, value, detail] of blocks) {
      p.rect(left, y, width, bh - 30, theme.panel, 28);
      p.text(label, left + 40, y + 60, 30, { color: theme.sub, weight: 600 });
      p.text(value.charAt(0).toUpperCase() + value.slice(1), left + 40, y + (story ? 150 : 125), story ? 78 : 60, { weight: 900, color: theme.accent, max: width - 80 });
      if (detail) p.text(detail, left + width - 40, y + 60, 28, { color: theme.sub, align: "right" });
      y += bh;
    }
    if (story) {
      const streaks = [...bilan.types].sort((a, b) => b.streak.days - a.streak.days).slice(0, 3);
      for (const t of streaks) {
        p.dot(left + 14, y + 26, 12, TYPE_HEX[t.type]);
        p.text(`${TYPE_LABELS[t.type]} : ${t.streak.days} jour${t.streak.days > 1 ? "s" : ""} de suite`, left + 44, y + 38, 34, { max: width - 44 });
        y += 64;
      }
    }
  }

  if (card === "type") {
    const t = bilan.types.find((x) => x.type === type) ?? bilan.types[0];
    if (t) {
      const f = mainFigure(t);
      p.text(TYPE_LABELS[t.type], left, y, story ? 84 : 66, { weight: 900, color: TYPE_HEX[t.type] });
      y += story ? 170 : 130;
      p.text(f.value, left, y, story ? 150 : 110, { weight: 900 });
      y += 52;
      p.text(`${f.label} · ${t.works} œuvres · ${t.completed} terminées`, left, y, 32, { color: theme.sub, max: width });
      y += story ? 90 : 60;
      const best = t.top[0] ?? null;
      const items: [string, BilanWork | null, string][] = [
        ["Meilleure note", best, best ? `★ ${starsLabel(best.rating)}` : ""],
        ["Première", t.first?.work ?? null, t.first ? shortDay(t.first.day) : ""],
        ["Dernière", t.last?.work ?? null, t.last ? shortDay(t.last.day) : ""],
      ];
      if (story) {
        for (const [label, w, detail] of items) {
          if (!w) continue;
          await p.poster(w, left, y, 140);
          p.text(label, left + 180, y + 60, 28, { color: theme.sub, weight: 600 });
          p.text(w.title, left + 180, y + 115, 42, { weight: 800, max: width - 180 });
          p.text(detail, left + 180, y + 165, 30, { color: theme.sub });
          y += 240;
        }
        p.text(`Plus longue série : ${t.streak.days} jour${t.streak.days > 1 ? "s" : ""}`, left, y + 40, 34, { weight: 700 });
        if (t.again.activities > 0) p.text(`${t.again.works.length} œuvre${t.again.works.length > 1 ? "s" : ""} ${AGAIN_LABEL[t.type]}`, left, y + 100, 34, { weight: 700 });
      } else {
        const cw = (width - 60) / 3;
        for (const [i, [label, w, detail]] of items.entries()) {
          if (!w) continue;
          const x = left + i * (cw + 30);
          await p.poster(w, x, y, 150);
          p.text(label, x, y + 265, 24, { color: theme.sub, weight: 600, max: cw });
          p.text(w.title, x, y + 302, 28, { weight: 800, max: cw });
          p.text(detail, x, y + 338, 24, { color: theme.sub, max: cw });
        }
      }
    }
  }

  if (card === "mois") {
    p.text("Mois par mois", left, y, story ? 84 : 66, { weight: 900 });
    y += story ? 70 : 40;
    p.text(`${bilan.totals.activities.toLocaleString("fr-FR")} activités en ${bilan.year}`, left, y + 20, 32, { color: theme.sub });
    const top = y + (story ? 120 : 70);
    const chartH = story ? 1100 : 600;
    const totals = bilan.months.map((m) => Object.values(m).reduce((a, b) => a + b, 0));
    const max = Math.max(1, ...totals);
    const bw = width / 12;
    bilan.months.forEach((m, i) => {
      let by = top + chartH;
      for (const t of bilan.types) {
        const h = (m[t.type] / max) * (chartH - 60);
        if (h <= 0) continue;
        by -= h;
        p.rect(left + i * bw + 8, by, bw - 16, h, TYPE_HEX[t.type], 6);
      }
      if (totals[i] > 0) p.text(String(totals[i]), left + i * bw + bw / 2, by - 12, 22, { align: "center", color: theme.sub });
      p.text(MONTHS_SHORT[i].replace(".", ""), left + i * bw + bw / 2, top + chartH + 40, 22, { align: "center", color: theme.sub, weight: bilan.busiestMonth?.month === i ? 800 : 400 });
    });
    let lx = left;
    const ly = top + chartH + (story ? 120 : 90);
    for (const t of bilan.types) {
      p.dot(lx + 10, ly - 9, 10, TYPE_HEX[t.type]);
      p.text(TYPE_LABELS[t.type], lx + 28, ly, 24, { color: theme.sub });
      lx += 50 + TYPE_LABELS[t.type].length * 13;
    }
  }

  p.text("omnilog", W - left, H - (story ? 90 : 60), 28, { align: "right", weight: 800, color: theme.sub });
}

/** Export du bilan en image (PNG) : une carte, un style et un format, dessinés dans le navigateur. */
export function BilanExport({ bilan }: { bilan: BilanData }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [card, setCard] = useState<Card>("resume");
  const [style, setStyle] = useState<Style>("neon");
  const [format, setFormat] = useState<Format>("story");
  const [type, setType] = useState<MediaType>(bilan.types[0]?.type ?? "movie");
  const [error, setError] = useState<string | null>(null);
  // Image dessinée pour ces choix : tant qu'elle ne correspond pas aux choix actuels, le dessin est en cours.
  const choice = `${card}|${style}|${format}|${type}`;
  const [drawn, setDrawn] = useState<string | null>(null);
  const busy = drawn !== choice;

  useEffect(() => {
    let alive = true;
    if (canvas.current)
      paint(canvas.current, bilan, card, style, format, type)
        .then(() => alive && setDrawn(choice))
        .catch(() => alive && setError("Image impossible à dessiner."));
    return () => {
      alive = false;
    };
  }, [bilan, card, style, format, type, choice]);

  const fileName = `omnilog-bilan-${bilan.year}-${card}${card === "type" ? `-${type}` : ""}-${style}.png`;

  async function blob(): Promise<Blob | null> {
    return new Promise((resolve) => canvas.current?.toBlob(resolve, "image/png") ?? resolve(null));
  }

  async function download() {
    setError(null);
    const b = await blob().catch(() => null);
    if (!b) return setError("Export impossible (une affiche bloque peut-être l'image).");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(b);
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  }

  async function share() {
    setError(null);
    const b = await blob().catch(() => null);
    if (!b) return setError("Partage impossible.");
    const file = new File([b], fileName, { type: "image/png" });
    // Sans partage natif (ordinateur) : simple téléchargement.
    if (!navigator.canShare?.({ files: [file] })) return download();
    try {
      await navigator.share({ files: [file], title: `Mon bilan ${bilan.year}` });
    } catch {
      // Partage annulé : rien à faire.
    }
  }

  const chip = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm ${active ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`;

  return (
    <section className="space-y-4 rounded-xl border border-white/10 p-4">
      <h2 className="text-xl font-semibold">Exporter en image</h2>
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CARDS.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setCard(value)} className={chip(card === value)}>
                {label}
              </button>
            ))}
          </div>
          {card === "type" && (
            <div className="flex flex-wrap gap-2">
              {bilan.types.map((t) => (
                <button key={t.type} type="button" onClick={() => setType(t.type)} className={chip(type === t.type)}>
                  {TYPE_LABELS[t.type]}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {STYLES.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setStyle(value)} className={chip(style === value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFormat(value)} className={chip(format === value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" disabled={busy} onClick={download} className="rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-white/90 disabled:opacity-50">
              {busy ? "Dessin…" : "Télécharger l'image"}
            </button>
            <button type="button" disabled={busy} onClick={share} className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-50">
              Partager
            </button>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
        <canvas
          ref={canvas}
          aria-label="Aperçu de l'image"
          className={`mx-auto rounded-xl shadow-2xl ${format === "story" ? "w-56 sm:w-64" : "w-64 sm:w-80"}`}
        />
      </div>
    </section>
  );
}
