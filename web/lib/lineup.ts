import { fantavotoRegole, modificatoreAtteso, pGioca, REGOLE_STANDARD, sceltaCapitano, type Orizzonte, type Regole, type SceltaCapitano } from "./rules.ts";
import type { Giocatore, Ruolo } from "./types.ts";

/** Difensori, centrocampisti, attaccanti per ogni modulo Classic. */
export const MODULI: Record<string, [number, number, number]> = {
  "3-4-3": [3, 4, 3],
  "3-5-2": [3, 5, 2],
  "4-3-3": [4, 3, 3],
  "4-4-2": [4, 4, 2],
  "4-5-1": [4, 5, 1],
  "5-3-2": [5, 3, 2],
  "5-4-1": [5, 4, 1],
};

/** Fantavoto medio di chi entra dalla panchina quando il titolare non gioca (come nel modello Python). */
export const VALORE_PANCHINA = 5.5;

export const SD_VOTO_DEFAULT: Record<Ruolo, number> = { P: 0.7, D: 0.6, C: 0.6, A: 0.65 };

export function punteggioAtteso(pGiocaVal: number, fvAtteso: number): number {
  return pGiocaVal * fvAtteso + (1 - pGiocaVal) * VALORE_PANCHINA;
}

export interface Contesto {
  regole: Regole;
  orizzonte: Orizzonte;
  sdVoto: Record<Ruolo, number>;
  /** Punteggi già calcolati per questo contesto (id → punteggio), per le ricerche pesanti. */
  cache?: Map<number, number>;
}

export const CONTESTO_STANDARD: Contesto = { regole: REGOLE_STANDARD, orizzonte: "giornata", sdVoto: SD_VOTO_DEFAULT };

/** Punteggio atteso di un giocatore schierato, con le regole della lega. */
export function punteggio(g: Giocatore, ctx: Contesto): number {
  const noto = ctx.cache?.get(g.id);
  if (noto !== undefined) return noto;
  return punteggioAtteso(pGioca(g, ctx.orizzonte), fantavotoRegole(g, ctx.regole, ctx.orizzonte));
}

export interface Formazione {
  modulo: string;
  titolari: Giocatore[];
  /** Panchina in ordine di sostituzione: per reparto, dal punteggio più alto. */
  panchina: Giocatore[];
  /** Punti attesi dei titolari (con le sostituzioni) più i modificatori attesi (difesa, capitano). */
  atteso: number;
  modificatore: number;
  /** Capitano e vice consigliati, se la lega ha il modificatore capitano. */
  capitano: SceltaCapitano | null;
}

function perRuolo(rosa: Giocatore[], ctx: Contesto): Record<Ruolo, Giocatore[]> {
  const out: Record<Ruolo, Giocatore[]> = { P: [], D: [], C: [], A: [] };
  const cache = new Map(rosa.map((g) => [g.id, punteggio(g, ctx)]));
  for (const g of rosa) out[g.ruolo].push(g);
  for (const r of Object.keys(out) as Ruolo[]) out[r].sort((a, b) => cache.get(b.id)! - cache.get(a.id)!);
  return out;
}

/** Formazione per un modulo: per ogni reparto i giocatori col punteggio più alto. */
export function formazioneConModulo(rosa: Giocatore[], modulo: string, ctx: Contesto, ordinati?: Record<Ruolo, Giocatore[]>): Formazione | null {
  const [d, c, a] = MODULI[modulo];
  const servono: Record<Ruolo, number> = { P: 1, D: d, C: c, A: a };
  const ord = ordinati ?? perRuolo(rosa, ctx);
  if ((Object.keys(servono) as Ruolo[]).some((r) => ord[r].length < servono[r])) return null;
  const titolari = (["P", "D", "C", "A"] as Ruolo[]).flatMap((r) => ord[r].slice(0, servono[r]));
  const panchina = (["P", "D", "C", "A"] as Ruolo[]).flatMap((r) => ord[r].slice(servono[r]));
  const base = titolari.reduce((s, g) => s + punteggio(g, ctx), 0);
  const modificatore = modificatoreAtteso(titolari, panchina, ctx.regole, ctx.orizzonte, ctx.sdVoto);
  const capitano = sceltaCapitano(titolari, ctx.regole, ctx.orizzonte, ctx.sdVoto);
  return { modulo, titolari, panchina, atteso: base + modificatore + (capitano?.atteso ?? 0), modificatore, capitano };
}

/**
 * Formazione con il punteggio atteso più alto tra i moduli ammessi dalla lega, oppure con il
 * modulo scelto. Restituisce null se la rosa non basta per nessun modulo.
 */
export function migliorFormazione(rosa: Giocatore[], ctx: Contesto = CONTESTO_STANDARD, moduloScelto?: string): Formazione | null {
  const ordinati = perRuolo(rosa, ctx);
  const moduli = moduloScelto ? [moduloScelto] : ctx.regole.moduli.filter((m) => m in MODULI);
  let migliore: Formazione | null = null;
  for (const modulo of moduli) {
    const f = formazioneConModulo(rosa, modulo, ctx, ordinati);
    if (f && (!migliore || f.atteso > migliore.atteso)) migliore = f;
  }
  return migliore;
}
