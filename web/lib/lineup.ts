import type { Giocatore, Ruolo } from "./types.ts";

/** Moduli ammessi nel fantacalcio Classic: difensori, centrocampisti, attaccanti. */
export const MODULI: Record<string, [number, number, number]> = {
  "3-4-3": [3, 4, 3],
  "3-5-2": [3, 5, 2],
  "4-3-3": [4, 3, 3],
  "4-4-2": [4, 4, 2],
  "4-5-1": [4, 5, 1],
  "5-3-2": [5, 3, 2],
  "5-4-1": [5, 4, 1],
};

/** Fantavoto medio di chi entra dalla panchina quando il titolare non gioca (stesso valore del modello Python). */
export const VALORE_PANCHINA = 5.5;

export function punteggioAtteso(pGioca: number, fvAtteso: number): number {
  return pGioca * fvAtteso + (1 - pGioca) * VALORE_PANCHINA;
}

export interface Formazione {
  modulo: string;
  titolari: Giocatore[];
  /** Panchina in ordine di sostituzione: per reparto, dal punteggio più alto. */
  panchina: Giocatore[];
  atteso: number;
}

/**
 * Formazione con il punteggio atteso più alto tra i moduli ammessi. Per ogni modulo
 * basta prendere, reparto per reparto, i giocatori col punteggio più alto.
 * Restituisce null se la rosa non ha abbastanza giocatori per nessun modulo.
 */
export function migliorFormazione(
  rosa: Giocatore[],
  punteggio: (g: Giocatore) => number = (g) => g.punteggio,
): Formazione | null {
  const perRuolo: Record<Ruolo, Giocatore[]> = { P: [], D: [], C: [], A: [] };
  for (const g of rosa) perRuolo[g.ruolo].push(g);
  for (const r of Object.keys(perRuolo) as Ruolo[]) {
    perRuolo[r].sort((a, b) => punteggio(b) - punteggio(a));
  }

  let migliore: Formazione | null = null;
  for (const [modulo, [d, c, a]] of Object.entries(MODULI)) {
    const servono: Record<Ruolo, number> = { P: 1, D: d, C: c, A: a };
    if ((Object.keys(servono) as Ruolo[]).some((r) => perRuolo[r].length < servono[r])) continue;
    const titolari = (["P", "D", "C", "A"] as Ruolo[]).flatMap((r) => perRuolo[r].slice(0, servono[r]));
    const atteso = titolari.reduce((s, g) => s + punteggio(g), 0);
    if (!migliore || atteso > migliore.atteso) {
      const panchina = (["P", "D", "C", "A"] as Ruolo[]).flatMap((r) => perRuolo[r].slice(servono[r]));
      migliore = { modulo, titolari, panchina, atteso };
    }
  }
  return migliore;
}
