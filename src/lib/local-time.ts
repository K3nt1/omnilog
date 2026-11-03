// Heure locale de l'utilisateur (users.timezone), pour les rappels et la page Aujourd'hui.
// Le Worker tourne en UTC : on passe toujours par Intl avec le fuseau choisi.

export interface LocalNow {
  /** AAAA-MM-JJ dans le fuseau. */
  date: string;
  /** HH:MM (24 h). */
  time: string;
  /** Bit du jour dans le masque des rappels : lun = 1, mar = 2… dim = 64. */
  dayBit: number;
}

const DAY_BITS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 4, Thu: 8, Fri: 16, Sat: 32, Sun: 64 };

/** Un fuseau IANA reconnu par le moteur (« Europe/Paris ») ; sinon null. */
export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== "string" || tz.length > 60) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export function localNow(timeZone: string, at = new Date()): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: validTimeZone(timeZone) ?? "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    dayBit: DAY_BITS[parts.weekday] ?? 1,
  };
}

/** Minutes depuis minuit pour « HH:MM ». */
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const DAY_LABELS: [bit: number, short: string][] = [
  [1, "Lun"],
  [2, "Mar"],
  [4, "Mer"],
  [8, "Jeu"],
  [16, "Ven"],
  [32, "Sam"],
  [64, "Dim"],
];

/** 127 → « Tous les jours », 64 → « Dim », 31 → « Lun, Mar, Mer, Jeu, Ven ». */
export function daysLabel(mask: number): string {
  if (mask === 127) return "Tous les jours";
  if (mask === 31) return "En semaine";
  if (mask === 96) return "Le week-end";
  return DAY_LABELS.filter(([bit]) => mask & bit)
    .map(([, label]) => label)
    .join(", ");
}
