import { MODULI } from "./lineup.ts";
import type { Giocatore, Ruolo } from "./types.ts";

/*
 * Probabili formazioni della giornata, partita per partita.
 *
 * Sul proprio PC arrivano da SOS Fanta (web/data/probabili.json, escluso da git): modulo,
 * titolari in ordine di reparto, ballottaggi, indisponibili con la nota. Dove mancano (sul
 * sito pubblicato, o se la pagina di SOS cambia) la formazione si ricava dal modello: per
 * ogni reparto i giocatori con la probabilità di giocare più alta, nel modulo che la
 * massimizza.
 */

export interface Nominato {
  id: number | null;
  nome: string;
}

export interface LatoProbabile {
  titolari: (Nominato & { pct: number | null })[];
  panchina: (Nominato & { pct: number | null })[];
  ballottaggi: { a: Nominato; pa: number; b: Nominato; pb: number }[];
  indisponibili: (Nominato & { stato: string | null; nota: string | null })[];
}

export interface PartitaProbabile {
  moduli: { casa: string | null; trasferta: string | null };
  lati: { casa: LatoProbabile; trasferta: LatoProbabile };
}

export interface Ballottaggio {
  a: Giocatore | Nominato;
  pa: number;
  b: Giocatore | Nominato;
  pb: number;
}

export interface Indisponibile {
  g: Giocatore | Nominato;
  stato: string | null;
  nota: string | null;
}

export interface FormazioneSquadra {
  squadra: string;
  modulo: string;
  /** Dal portiere all'attacco: una riga per reparto del modulo (4-2-3-1 → 1, 4, 2, 3, 1). */
  linee: Giocatore[][];
  titolari: Giocatore[];
  panchina: Giocatore[];
  ballottaggi: Ballottaggio[];
  indisponibili: Indisponibile[];
  fonte: "sos" | "modello";
}

/** Quanti giocatori mostrare in panchina. */
const PANCHINA_MOSTRATA = 12;

/** "4-2-3-1" → [1, 4, 2, 3, 1]; null se il modulo non è leggibile o non fa 10 di movimento. */
export function righeModulo(modulo: string | null | undefined): number[] | null {
  if (!modulo || !/^\d(-\d){1,4}$/.test(modulo)) return null;
  const parti = modulo.split("-").map(Number);
  return parti.reduce((a, b) => a + b, 0) === 10 ? [1, ...parti] : null;
}

function spezza<T>(lista: T[], righe: number[]): T[][] {
  const out: T[][] = [];
  let i = 0;
  for (const n of righe) {
    out.push(lista.slice(i, i + n));
    i += n;
  }
  return out;
}

const perGioca = (a: Giocatore, b: Giocatore) => b.p_gioca - a.p_gioca;

/** Formazione ricavata dal modello: il modulo Classic che massimizza la probabilità di giocare dei titolari. */
export function formazioneDalModello(rosa: Giocatore[]): { modulo: string; linee: Giocatore[][] } | null {
  const perRuolo: Record<Ruolo, Giocatore[]> = { P: [], D: [], C: [], A: [] };
  for (const g of [...rosa].sort(perGioca)) perRuolo[g.ruolo].push(g);
  let migliore: { modulo: string; linee: Giocatore[][]; somma: number } | null = null;
  for (const [modulo, [d, c, a]] of Object.entries(MODULI)) {
    const linee = [perRuolo.P.slice(0, 1), perRuolo.D.slice(0, d), perRuolo.C.slice(0, c), perRuolo.A.slice(0, a)];
    if (linee.flat().length !== 11) continue;
    const somma = linee.flat().reduce((s, g) => s + g.p_gioca, 0);
    if (!migliore || somma > migliore.somma) migliore = { modulo, linee, somma };
  }
  return migliore && { modulo: migliore.modulo, linee: migliore.linee };
}

export function formazioneSquadra(
  squadra: string,
  rosa: Giocatore[],
  perId: Map<number, Giocatore>,
  lato?: LatoProbabile,
  modulo?: string | null,
): FormazioneSquadra | null {
  const trova = (n: Nominato): Giocatore | Nominato => (n.id != null && perId.get(n.id)) || n;
  const righe = righeModulo(modulo);
  const titolariSos = lato?.titolari.map((t) => (t.id != null ? perId.get(t.id) : undefined)) ?? [];
  const sosValida = !!righe && titolariSos.length === 11 && titolariSos.every((g) => g && g.squadra === squadra);

  let linee: Giocatore[][];
  let moduloUsato: string;
  if (sosValida) {
    linee = spezza(titolariSos as Giocatore[], righe!);
    moduloUsato = modulo!;
  } else {
    const m = formazioneDalModello(rosa);
    if (!m) return null;
    linee = m.linee;
    moduloUsato = m.modulo;
  }
  const titolari = linee.flat();
  const inCampo = new Set(titolari.map((g) => g.id));
  const indisponibili = sosValida ? lato!.indisponibili.map((x) => ({ g: trova(x), stato: x.stato, nota: x.nota })) : [];
  const fuori = new Set(indisponibili.map((x) => x.g.id).filter((id): id is number => id != null));
  return {
    squadra,
    modulo: moduloUsato,
    linee,
    titolari,
    panchina: rosa.filter((g) => !inCampo.has(g.id) && !fuori.has(g.id)).sort(perGioca).slice(0, PANCHINA_MOSTRATA),
    ballottaggi: sosValida ? lato!.ballottaggi.map((b) => ({ a: trova(b.a), pa: b.pa, b: trova(b.b), pb: b.pb })) : [],
    indisponibili,
    fonte: sosValida ? "sos" : "modello",
  };
}

/** Tre lettere per squadra, uniche in Serie A: Atalanta → ATA, Juventus → JUV. */
export const sigla = (squadra: string) => squadra.slice(0, 3).toUpperCase();

/** Colori sociali (sfondo, testo) per il distintivo con la sigla, al posto dei loghi. */
export const COLORI: Record<string, [string, string]> = {
  Atalanta: ["#1e71b8", "#000000"],
  Bologna: ["#a21c26", "#1a2f48"],
  Cagliari: ["#a50e2d", "#002350"],
  Como: ["#003a70", "#ffffff"],
  Cremonese: ["#9d2235", "#8a8d8f"],
  Empoli: ["#005bac", "#ffffff"],
  Fiorentina: ["#482e92", "#ffffff"],
  Frosinone: ["#ffd200", "#0047ab"],
  Genoa: ["#a91e2c", "#002a5c"],
  Inter: ["#0068a8", "#000000"],
  Juventus: ["#000000", "#ffffff"],
  Lazio: ["#87d8f7", "#ffffff"],
  Lecce: ["#ffd100", "#d71920"],
  Milan: ["#fb090b", "#000000"],
  Monza: ["#e2001a", "#ffffff"],
  Napoli: ["#12a0d7", "#ffffff"],
  Parma: ["#ffd200", "#1b4f9c"],
  Pisa: ["#000000", "#005aab"],
  Roma: ["#8e1f2f", "#f0bc42"],
  Sassuolo: ["#00a752", "#000000"],
  Torino: ["#8a1e03", "#ffffff"],
  Udinese: ["#000000", "#ffffff"],
  Venezia: ["#f58025", "#00543d"],
  Verona: ["#002f6c", "#ffd400"],
};
