import { migliorFormazione, punteggioAtteso } from "./lineup.ts";
import type { Giocatore, Ruolo } from "./types.ts";

/**
 * Valore di un giocatore da qui a fine stagione: probabilità di giocare e fantavoto
 * contro un avversario medio (campi *_stagione), non la sola prossima giornata.
 */
export function valoreStagione(g: Giocatore): number {
  const p = g.p_gioca_stagione ?? g.p_gioca;
  const fv = g.fv_stagione ?? g.fv_atteso;
  return punteggioAtteso(p, fv);
}

/** Peso delle riserve: coprono infortuni e turnover, ma valgono meno dei titolari. */
const PESO_RISERVE = 0.1;
const RISERVE_CONTATE: Record<Ruolo, number> = { P: 1, D: 2, C: 2, A: 2 };

/** Forza di una rosa: punti attesi della formazione migliore + un piccolo peso alle prime riserve. */
export function forzaRosa(rosa: Giocatore[]): number {
  const f = migliorFormazione(rosa, valoreStagione);
  if (!f) return 0;
  const contate: Record<Ruolo, number> = { P: 0, D: 0, C: 0, A: 0 };
  let riserve = 0;
  for (const g of f.panchina) {
    if (contate[g.ruolo] < RISERVE_CONTATE[g.ruolo]) {
      riserve += valoreStagione(g);
      contate[g.ruolo]++;
    }
  }
  return f.atteso + PESO_RISERVE * riserve;
}

export interface Scambio {
  cedo: Giocatore[];
  ricevo: Giocatore[];
  controparte: string;
  /** Variazione dei punti attesi a giornata per la mia squadra. */
  deltaMio: number;
  /** Variazione dei punti attesi a giornata per la controparte. */
  deltaLoro: number;
}


export function valutaScambio(
  mia: Giocatore[],
  loro: Giocatore[],
  cedo: Giocatore[],
  ricevo: Giocatore[],
  controparte: string,
  forzaPrima?: { mia: number; loro: number },
): Scambio {
  const via = new Set(cedo.map((g) => g.id));
  const arrivano = new Set(ricevo.map((g) => g.id));
  const miaDopo = [...mia.filter((g) => !via.has(g.id)), ...ricevo];
  const loroDopo = [...loro.filter((g) => !arrivano.has(g.id)), ...cedo];
  const prima = forzaPrima ?? { mia: forzaRosa(mia), loro: forzaRosa(loro) };
  return {
    cedo,
    ricevo,
    controparte,
    deltaMio: forzaRosa(miaDopo) - prima.mia,
    deltaLoro: forzaRosa(loroDopo) - prima.loro,
  };
}

/**
 * Giocatori che ha senso mettere in uno scambio doppio: per reparto i migliori fino a
 * poco oltre la linea dei titolari (chi è molto più in basso non sposta la formazione).
 */
const CANDIDATI_PER_RUOLO: Record<Ruolo, number> = { P: 2, D: 6, C: 6, A: 5 };

function candidati(rosa: Giocatore[]): Giocatore[] {
  return (["P", "D", "C", "A"] as Ruolo[]).flatMap((r) =>
    rosa
      .filter((g) => g.ruolo === r)
      .sort((a, b) => valoreStagione(b) - valoreStagione(a))
      .slice(0, CANDIDATI_PER_RUOLO[r]),
  );
}

/** Coppie di ruoli diversi, raggruppate per ruoli ("AD", "CD", ...). */
function coppieMiste(rosa: Giocatore[]): Map<string, [Giocatore, Giocatore][]> {
  const xs = candidati(rosa);
  const out = new Map<string, [Giocatore, Giocatore][]>();
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      if (xs[i].ruolo === xs[j].ruolo) continue;
      const k = [xs[i].ruolo, xs[j].ruolo].sort().join("");
      out.set(k, [...(out.get(k) ?? []), [xs[i], xs[j]]]);
    }
  }
  return out;
}

const SOGLIA = 0.05;

/**
 * Scambi 1 contro 1 (stesso ruolo) e 2 contro 2 (stessi due ruoli), perché le rose Classic
 * hanno composizione fissa, che migliorano ENTRAMBE le squadre: sono quelli che l'altro ha
 * motivo di accettare. Ordinati per il guadagno della parte che guadagna meno, poi per il mio.
 */
export function suggerisciScambi(
  mia: Giocatore[],
  altre: { nome: string; rosa: Giocatore[] }[],
  limite = 15,
): Scambio[] {
  const risultati: Scambio[] = [];
  const forzaMia = forzaRosa(mia);
  const mieCoppie = coppieMiste(mia);

  for (const altra of altre) {
    const prima = { mia: forzaMia, loro: forzaRosa(altra.rosa) };
    const prova = (cedo: Giocatore[], ricevo: Giocatore[]) => {
      const s = valutaScambio(mia, altra.rosa, cedo, ricevo, altra.nome, prima);
      if (s.deltaMio > SOGLIA && s.deltaLoro > SOGLIA) risultati.push(s);
    };
    for (const a of mia) {
      for (const b of altra.rosa) if (a.ruolo === b.ruolo) prova([a], [b]);
    }
    for (const [ruoli, loroCoppie] of coppieMiste(altra.rosa)) {
      for (const cedo of mieCoppie.get(ruoli) ?? []) {
        for (const ricevo of loroCoppie) prova(cedo, ricevo);
      }
    }
  }
  risultati.sort(
    (x, y) => Math.min(y.deltaMio, y.deltaLoro) - Math.min(x.deltaMio, x.deltaLoro) || y.deltaMio - x.deltaMio,
  );
  return diversi(risultati, limite);
}

/**
 * Tiene le proposte migliori facendo comparire ogni giocatore in una sola: altrimenti la
 * lista si riempie di varianti dello stesso scambio con un giocatore di contorno diverso.
 */
function diversi(ordinati: Scambio[], limite: number): Scambio[] {
  const usati = new Set<number>();
  const scelti: Scambio[] = [];
  for (const s of ordinati) {
    const ids = [...s.cedo, ...s.ricevo].map((g) => g.id);
    if (ids.some((id) => usati.has(id))) continue;
    ids.forEach((id) => usati.add(id));
    scelti.push(s);
    if (scelti.length === limite) break;
  }
  return scelti;
}
