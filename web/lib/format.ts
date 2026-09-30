const decimale = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimale2 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const voto = (x: number | null | undefined) => (x == null ? "–" : decimale.format(x));
export const due = (x: number | null | undefined) => (x == null ? "–" : decimale2.format(x));
export const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)}%`);
export const conSegno = (x: number) => `${x >= 0 ? "+" : "−"}${decimale2.format(Math.abs(x))}`;

const giorno = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "long" });
export const data = (iso: string) => giorno.format(new Date(`${iso}T12:00:00`));

/** "10–12 ottobre" dalle date delle partite della giornata. */
export function intervallo(date: string[]): string {
  const ordinate = [...date].sort();
  const mese = new Intl.DateTimeFormat("it-IT", { month: "long" });
  const a = new Date(`${ordinate[0]}T12:00:00`);
  const b = new Date(`${ordinate[ordinate.length - 1]}T12:00:00`);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${mese.format(b)}`;
  return `${a.getDate()} ${mese.format(a)} – ${b.getDate()} ${mese.format(b)}`;
}
