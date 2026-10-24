// Texte de recherche normalisé : minuscules, sans accents, ligatures dépliées.
// SQLite ne sait comparer sans tenir compte de la casse que les lettres ASCII (« É » ≠ « é »),
// on stocke donc une version normalisée du titre (media.search_text) et on normalise la saisie pareil.

export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents latins seulement (les signes des kana japonais restent)
    .normalize("NFC")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Valeur de media.search_text : titre et titre original. */
export function mediaSearchText(title: string, originalTitle: string | null): string {
  return normalizeSearch([title, originalTitle].filter(Boolean).join(" "));
}
