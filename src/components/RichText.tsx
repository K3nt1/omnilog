import { Fragment, type ReactNode } from "react";

// Les critiques Letterboxd sont exportées en HTML simple (<i>, <b>, <a href>, <br>, <p>…).
// On ne les injecte jamais telles quelles dans la page : on les convertit en éléments React,
// en ne gardant que quelques balises sûres (le reste est affiché comme du texte).

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? match;
  });
}

/** Version texte, pour le champ de modification : retours à la ligne gardés, balises retirées. */
export function htmlToPlain(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, label: string) => (label === href ? href : `${label} (${href})`))
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

type Node = { tag: string; href?: string; children: (Node | string)[] };

const ALLOWED = new Set(["i", "em", "b", "strong", "a", "p", "blockquote", "u", "s"]);

function parse(html: string): (Node | string)[] {
  const root: Node = { tag: "root", children: [] };
  const stack: Node[] = [root];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>/gi;
  let last = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index > last) stack[stack.length - 1].children.push(decodeEntities(html.slice(last, m.index)));
    last = re.lastIndex;
    const [, closing, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (tag === "br") {
      stack[stack.length - 1].children.push("\n");
      continue;
    }
    if (!ALLOWED.has(tag)) continue; // balise inconnue : ignorée, son texte reste
    if (closing) {
      const index = stack.map((n) => n.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const href = tag === "a" ? /href="([^"]*)"/i.exec(attrs)?.[1] : undefined;
    const node: Node = { tag, href: href && /^https?:\/\//i.test(href) ? decodeEntities(href) : undefined, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  if (last < html.length) stack[stack.length - 1].children.push(decodeEntities(html.slice(last)));
  return root.children;
}

function render(nodes: (Node | string)[], key = "n"): ReactNode[] {
  return nodes.map((node, i) => {
    const k = `${key}-${i}`;
    if (typeof node === "string") return <Fragment key={k}>{node}</Fragment>;
    const children = render(node.children, k);
    switch (node.tag) {
      case "i":
      case "em":
        return <em key={k}>{children}</em>;
      case "b":
      case "strong":
        return <strong key={k}>{children}</strong>;
      case "u":
        return <u key={k}>{children}</u>;
      case "s":
        return <s key={k}>{children}</s>;
      case "blockquote":
        return (
          <blockquote key={k} className="my-1 border-l-2 border-white/20 pl-3 text-white/70">
            {children}
          </blockquote>
        );
      case "p":
        return (
          <span key={k} className="block [&:not(:first-child)]:mt-3">
            {children}
          </span>
        );
      case "a":
        return node.href ? (
          <a key={k} href={node.href} target="_blank" rel="noopener noreferrer nofollow" className="text-sky-300 underline">
            {children}
          </a>
        ) : (
          <Fragment key={k}>{children}</Fragment>
        );
      default:
        return <Fragment key={k}>{children}</Fragment>;
    }
  });
}

/** Critique (HTML Letterboxd ou texte saisi ici) affichée sans risque. */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`whitespace-pre-line ${className}`}>{render(parse(text))}</div>;
}
