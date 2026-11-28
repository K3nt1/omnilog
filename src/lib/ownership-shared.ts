// Plateformes possédées (« Où je l'ai ») : listes, règles et libellés partagés par le serveur et l'interface.

export type OwnershipFormat = "physical" | "digital" | "emulated";

export interface Ownership {
  /** Abréviation de la plateforme (« PS5 », « PC », « Switch ») ; émulation : console émulée. */
  platform: string;
  format: OwnershipFormat;
  /** Ordinateur : launcher (« steam »…). */
  store: string | null;
  /** Dématérialisé : abonnement qui donne le jeu (« game_pass »…), sinon acheté (ou offert). */
  subscription: string | null;
  /** Émulation : appareil et émulateur. */
  device: string | null;
  emulator: string | null;
}

/** Launchers d'un ordinateur. */
export const LAUNCHERS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic Games Store",
  gog: "GOG",
  ea: "EA App",
  ubisoft: "Ubisoft Connect",
  battlenet: "Battle.net",
  xbox: "Xbox",
  itch: "itch.io",
  amazon: "Amazon Games",
  other: "Autre launcher",
};

export const SUBSCRIPTIONS: Record<string, string> = {
  game_pass: "Game Pass",
  ps_plus: "PS Plus",
  nso: "Nintendo Switch Online",
  ea_play: "EA Play",
  ubisoft_plus: "Ubisoft+",
  apple_arcade: "Apple Arcade",
  netflix: "Netflix Jeux",
};

/** Appareils proposés pour un émulateur (un autre peut être écrit). */
export const DEVICES = ["PC", "Steam Deck", "Recalbox", "Batocera", "RetroPie", "Téléphone", "Tablette", "Console portable rétro"];

/** Émulateurs proposés (un autre peut être écrit). */
export const EMULATORS = [
  "RetroArch",
  "EmuDeck",
  "Dolphin",
  "PCSX2",
  "DuckStation",
  "PPSSPP",
  "RPCS3",
  "Cemu",
  "Ryujinx",
  "melonDS",
  "Azahar",
  "mGBA",
  "Snes9x",
  "Mupen64Plus",
  "Xemu",
  "xenia",
  "Flycast",
  "MAME",
];

/** Ordinateur (PC, Mac, Linux) : launchers plutôt que physique / démat seul. */
export const isComputer = (platform: string) => /^(pc|mac|linux)\b/i.test(platform.trim());

/** Abonnements cohérents avec une plateforme (et, sur ordinateur, avec le launcher). */
export function subscriptionsFor(platform: string, store: string | null): string[] {
  const p = platform.trim().toLowerCase();
  if (isComputer(p)) {
    if (store === "xbox") return ["game_pass"];
    if (store === "ea") return ["ea_play"];
    if (store === "ubisoft") return ["ubisoft_plus"];
    return [];
  }
  if (/^ps[45]$|playstation [45]/.test(p)) return ["ps_plus"];
  if (/xbox|^xone$|^x360$|series x/.test(p)) return ["game_pass"];
  if (/switch|^ns2?$/.test(p)) return ["nso"];
  if (/ios|iphone|ipad/.test(p)) return ["apple_arcade", "netflix"];
  if (/android/.test(p)) return ["netflix"];
  return [];
}

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text && text.length <= max ? text : null;
};

/** Vérifie une possession envoyée par l'interface ; renvoie un message d'erreur ou la possession propre. */
export function parseOwnership(value: unknown): Ownership | string {
  const o = (value ?? {}) as Record<string, unknown>;
  const platform = clean(o.platform, 60);
  if (!platform) return "Plateforme manquante.";
  const format = o.format;
  if (format !== "physical" && format !== "digital" && format !== "emulated") return "Format invalide.";
  if (format === "emulated") {
    return { platform, format, store: null, subscription: null, device: clean(o.device, 40), emulator: clean(o.emulator, 60) };
  }
  let store: string | null = null;
  if (isComputer(platform) && format === "digital") {
    store = typeof o.store === "string" && o.store in LAUNCHERS ? o.store : null;
    if (!store) return "Choisis le launcher.";
  }
  let subscription: string | null = null;
  if (o.subscription !== null && o.subscription !== undefined && o.subscription !== "") {
    if (format !== "digital" || typeof o.subscription !== "string" || !subscriptionsFor(platform, store).includes(o.subscription)) {
      return "Abonnement incompatible avec cette plateforme.";
    }
    subscription = o.subscription;
  }
  return { platform, format, store, subscription, device: null, emulator: null };
}

/** Même possession (plateforme, format, launcher, appareil) : la clé de la table. */
export const sameOwnership = (a: Ownership, b: Ownership) =>
  a.platform === b.platform && a.format === b.format && (a.store ?? "") === (b.store ?? "") && (a.device ?? "") === (b.device ?? "");

/** « PS5 · physique », « PC · Steam · Game Pass », « PS1 · émulé (Steam Deck, DuckStation) ». */
export function ownershipLabel(o: Ownership): string {
  if (o.format === "emulated") {
    const how = [o.device, o.emulator].filter(Boolean).join(", ");
    return `${o.platform} · émulé${how ? ` (${how})` : ""}`;
  }
  const parts = [o.platform];
  if (o.store) parts.push(LAUNCHERS[o.store] ?? o.store);
  else parts.push(o.format === "physical" ? (isComputer(o.platform) ? "boîte" : "physique") : "démat");
  if (o.subscription) parts.push(SUBSCRIPTIONS[o.subscription] ?? o.subscription);
  return parts.join(" · ");
}

/**
 * Valeurs du filtre « Possédé sur » et du tirage au sort :
 * « p:PS5 » (plateforme, émulation comprise), « s:steam » (launcher), « a:game_pass » (abonnement), « e » (émulé).
 */
export function ownedKeys(o: Ownership): string[] {
  const keys = [`p:${o.platform}`];
  if (o.store) keys.push(`s:${o.store}`);
  if (o.subscription) keys.push(`a:${o.subscription}`);
  if (o.format === "emulated") keys.push("e");
  return keys;
}

export function ownedKeyLabel(key: string): string {
  if (key === "e") return "émulateur";
  const [kind, value] = [key.slice(0, 1), key.slice(2)];
  if (kind === "s") return `PC · ${LAUNCHERS[value] ?? value}`;
  if (kind === "a") return SUBSCRIPTIONS[value] ?? value;
  return value;
}

/** Valeur de filtre valide (venue de l'adresse) ? */
export function isOwnedKey(value: string): boolean {
  if (value === "e") return true;
  const kind = value.slice(0, 2);
  const rest = value.slice(2);
  if (kind === "s:") return rest in LAUNCHERS;
  if (kind === "a:") return rest in SUBSCRIPTIONS;
  return kind === "p:" && rest.length > 0 && rest.length <= 60;
}
