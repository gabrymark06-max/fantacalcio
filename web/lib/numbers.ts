/** "6,25", "6.25", "+1", "-0,5" → numero; null se non è (ancora) un numero valido. */
export function leggiNumero(testo: string): number | null {
  const t = testo.trim().replace(",", ".");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  return Number(t);
}

/** 6.25 → "6,25": i numeri si mostrano con la virgola. */
export function formattaNumero(v: number): string {
  return String(v).replace(".", ",");
}
