import { punteggio, type Contesto } from "./lineup.ts";
import { contestoStagione, forzaRosa } from "./trades.ts";
import type { Giocatore } from "./types.ts";

/*
 * Svincolati da prendere: giocatori del listone che non sono in nessuna rosa della lega.
 * Per ognuno si prova a sostituirlo a ogni giocatore dello stesso ruolo della mia rosa (le
 * rose Classic hanno composizione fissa) e si misura quanto migliora la mia formazione da qui
 * a fine stagione, con le regole della lega: lo stesso metro degli scambi.
 */

export interface Svincolo {
  prendi: Giocatore;
  taglia: Giocatore;
  /** Punti attesi a giornata guadagnati dalla formazione, da qui a fine stagione. */
  guadagno: number;
}

/** Guadagno minimo per proporre uno svincolo (punti a giornata, ~2 punti su una stagione). */
export const GUADAGNO_MINIMO_SVINCOLO = 0.05;
/** Quanti liberi per ruolo provare: i migliori per punti attesi. */
const CANDIDATI_PER_RUOLO = 12;

export function liberi(listone: Giocatore[], rose: Giocatore[][]): Giocatore[] {
  const occupati = new Set(rose.flat().map((g) => g.id));
  return listone.filter((g) => !occupati.has(g.id));
}

export function suggerisciSvincolati(
  mia: Giocatore[],
  disponibili: Giocatore[],
  ctxBase: Contesto,
  limite = 8,
): Svincolo[] {
  const ctx = contestoStagione(ctxBase, [mia, disponibili]);
  const prima = forzaRosa(mia, ctx).forza;
  const risultati: Svincolo[] = [];
  for (const ruolo of ["P", "D", "C", "A"] as const) {
    const miei = mia.filter((g) => g.ruolo === ruolo);
    const candidati = disponibili
      .filter((g) => g.ruolo === ruolo)
      .sort((a, b) => punteggio(b, ctx) - punteggio(a, ctx))
      .slice(0, CANDIDATI_PER_RUOLO);
    for (const prendi of candidati) {
      let migliore: Svincolo | null = null;
      for (const taglia of miei) {
        const dopo = forzaRosa([...mia.filter((g) => g.id !== taglia.id), prendi], ctx).forza;
        if (!migliore || dopo - prima > migliore.guadagno) migliore = { prendi, taglia, guadagno: dopo - prima };
      }
      if (migliore && migliore.guadagno >= GUADAGNO_MINIMO_SVINCOLO) risultati.push(migliore);
    }
  }
  risultati.sort((a, b) => b.guadagno - a.guadagno);
  // un taglio per proposta: altrimenti la lista ripete lo stesso scambio con liberi simili
  const tagliati = new Set<number>();
  return risultati.filter((s) => !tagliati.has(s.taglia.id) && tagliati.add(s.taglia.id)).slice(0, limite);
}
