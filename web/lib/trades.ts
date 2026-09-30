import { migliorFormazione, punteggio, type Contesto, type Formazione } from "./lineup.ts";
import type { Giocatore, Ruolo } from "./types.ts";

/*
 * Motore degli scambi.
 *
 * Il mio guadagno è misurato con il modello: quanti punti attesi a giornata guadagna la mia
 * formazione migliore da qui a fine stagione, con le regole della lega. L'altro fantallenatore
 * però non vede il modello: giudica soprattutto il valore di mercato (FVM di fantacalcio.it) e
 * se la sua squadra migliora. Uno scambio è proponibile solo se regge anche ai suoi occhi.
 *
 * Idee riprese da:
 *  - KeepTradeCut: equo se i valori di mercato differiscono meno del 10%, con valori convessi
 *    (un campione vale più di due giocatori medi: "quattro monete da 25 non fanno un dollaro");
 *  - FantasyPros Trade Finder: incrociare eccedenze di una rosa con carenze dell'altra e stimare
 *    se l'altro accetterà;
 *  - ESPN/IBM (Large Scale Diverse Combinatorial Optimization): proposte diverse tra loro.
 */

/** Esponente che rende convesso il valore di mercato percepito. */
const ESPONENTE_MERCATO = 1.3;

export function valoreMercato(g: Giocatore): number {
  return Math.pow(Math.max(g.fvm ?? 1, 1), ESPONENTE_MERCATO);
}

/** Peso delle riserve: coprono infortuni e turnover, ma valgono meno dei titolari. */
const PESO_RISERVE = 0.1;
const RISERVE_CONTATE: Record<Ruolo, number> = { P: 1, D: 2, C: 2, A: 2 };

/** Contesto per gli scambi: conta il resto della stagione, non la prossima partita. */
export function contestoStagione(ctx: Contesto, rose: Giocatore[][]): Contesto {
  const base: Contesto = { ...ctx, orizzonte: "stagione", cache: undefined };
  const cache = new Map<number, number>();
  for (const rosa of rose) for (const g of rosa) cache.set(g.id, punteggio(g, base));
  return { ...base, cache };
}

/** Forza di una rosa: punti attesi della formazione migliore + un piccolo peso alle prime riserve. */
export function forzaRosa(rosa: Giocatore[], ctx: Contesto): { forza: number; formazione: Formazione | null } {
  const f = migliorFormazione(rosa, ctx);
  if (!f) return { forza: 0, formazione: null };
  const contate: Record<Ruolo, number> = { P: 0, D: 0, C: 0, A: 0 };
  let riserve = 0;
  for (const g of f.panchina) {
    if (contate[g.ruolo] < RISERVE_CONTATE[g.ruolo]) {
      riserve += punteggio(g, ctx);
      contate[g.ruolo]++;
    }
  }
  return { forza: f.atteso + PESO_RISERVE * riserve, formazione: f };
}

export interface Scambio {
  cedo: Giocatore[];
  ricevo: Giocatore[];
  controparte: string;
  /** Punti attesi a giornata guadagnati dalla mia squadra. */
  deltaMio: number;
  /** Punti attesi a giornata guadagnati dalla controparte. */
  deltaLoro: number;
  /** Valore di mercato che la controparte riceve diviso quello che cede. */
  equita: number;
  fvmRicevono: number;
  fvmCedono: number;
  /** Stima della probabilità che la controparte accetti (0–1). */
  pAccetta: number;
  entranoTitolari: Giocatore[];
  esconoTitolari: Giocatore[];
}

/**
 * Probabilità che l'altro accetti: cresce con l'equità di mercato ai suoi occhi e con quanto
 * migliora la sua formazione. A equità 1 e formazione invariata vale 0,5; equità 1,1 → ~0,62;
 * equità 0,9 → ~0,37; +0,2 punti a giornata per lui → ~0,69. Oltre il +20% di valore di
 * mercato regalato non cresce più: un'offerta troppo generosa non compensa una squadra che
 * peggiora (e insospettisce).
 */
export function probabilitaAccetta(equita: number, deltaLoro: number): number {
  const eq = Math.min(Math.max(equita, 0.7), 1.2);
  const z = 5 * Math.log(eq) + 4 * deltaLoro;
  return 1 / (1 + Math.exp(-z));
}

export function etichettaAccetta(p: number): "alta" | "media" | "bassa" {
  return p >= 0.6 ? "alta" : p >= 0.45 ? "media" : "bassa";
}

const somma = (xs: Giocatore[], f: (g: Giocatore) => number) => xs.reduce((s, g) => s + f(g), 0);

export function valutaScambio(
  mia: Giocatore[],
  loro: Giocatore[],
  cedo: Giocatore[],
  ricevo: Giocatore[],
  controparte: string,
  ctx: Contesto,
  prima?: { mia: ReturnType<typeof forzaRosa>; loro: ReturnType<typeof forzaRosa> },
): Scambio {
  const via = new Set(cedo.map((g) => g.id));
  const arrivano = new Set(ricevo.map((g) => g.id));
  const miaDopo = forzaRosa([...mia.filter((g) => !via.has(g.id)), ...ricevo], ctx);
  const loroDopo = forzaRosa([...loro.filter((g) => !arrivano.has(g.id)), ...cedo], ctx);
  const p = prima ?? { mia: forzaRosa(mia, ctx), loro: forzaRosa(loro, ctx) };

  const deltaLoro = loroDopo.forza - p.loro.forza;
  const vRicevono = somma(cedo, valoreMercato);
  const vCedono = somma(ricevo, valoreMercato);
  const equita = vCedono > 0 ? vRicevono / vCedono : 1;

  const titolariPrima = new Set((p.mia.formazione?.titolari ?? []).map((g) => g.id));
  const titolariDopo = miaDopo.formazione?.titolari ?? [];
  const idsDopo = new Set(titolariDopo.map((g) => g.id));

  return {
    cedo,
    ricevo,
    controparte,
    deltaMio: miaDopo.forza - p.mia.forza,
    deltaLoro,
    equita,
    fvmRicevono: somma(cedo, (g) => g.fvm ?? 0),
    fvmCedono: somma(ricevo, (g) => g.fvm ?? 0),
    pAccetta: probabilitaAccetta(equita, deltaLoro),
    entranoTitolari: titolariDopo.filter((g) => !titolariPrima.has(g.id)),
    esconoTitolari: (p.mia.formazione?.titolari ?? []).filter((g) => !idsDopo.has(g.id)),
  };
}

function gruppiPerRuoli(rosa: Giocatore[], dimensione: 1 | 2): Map<string, Giocatore[][]> {
  const out = new Map<string, Giocatore[][]>();
  const add = (gs: Giocatore[]) => {
    const k = gs.map((g) => g.ruolo).sort().join("");
    out.set(k, [...(out.get(k) ?? []), gs]);
  };
  if (dimensione === 1) rosa.forEach((g) => add([g]));
  else for (let i = 0; i < rosa.length; i++) for (let j = i + 1; j < rosa.length; j++) add([rosa[i], rosa[j]]);
  return out;
}

/** Soglie: sotto queste lo scambio non vale la fatica di proporlo o verrebbe rifiutato. */
export const SOGLIE = {
  /** guadagno minimo per me, punti attesi a giornata (~5 punti su una stagione) */
  guadagnoMinimo: 0.15,
  /** probabilità minima che l'altro accetti */
  accettazioneMinima: 0.45,
  /** l'altro non accetta se la sua formazione peggiora in modo evidente (~5 punti a stagione) */
  perditaMassimaLoro: 0.15,
  /** filtro rapido sull'equità di mercato prima del calcolo completo */
  equitaMin: 0.8,
  equitaMax: 1.4,
};

/**
 * Scambi 1 contro 1 e 2 contro 2 a ruoli invariati (le rose Classic hanno composizione fissa)
 * che mi fanno guadagnare e che l'altro ha buone ragioni di accettare. Ordinati per guadagno
 * atteso × probabilità di accettazione; ogni giocatore compare in una sola proposta.
 */
export function suggerisciScambi(
  mia: Giocatore[],
  altre: { nome: string; rosa: Giocatore[] }[],
  ctxBase: Contesto,
  limite = 12,
): Scambio[] {
  const ctx = contestoStagione(ctxBase, [mia, ...altre.map((a) => a.rosa)]);
  const valore = (g: Giocatore) => ctx.cache!.get(g.id) ?? 0;
  const risultati: Scambio[] = [];
  const forzaMia = forzaRosa(mia, ctx);
  const mieGruppi = [gruppiPerRuoli(mia, 1), gruppiPerRuoli(mia, 2)];

  for (const altra of altre) {
    const prima = { mia: forzaMia, loro: forzaRosa(altra.rosa, ctx) };
    const loroGruppi = [gruppiPerRuoli(altra.rosa, 1), gruppiPerRuoli(altra.rosa, 2)];
    for (let dim = 0; dim < 2; dim++) {
      for (const [ruoli, loroOpzioni] of loroGruppi[dim]) {
        const mieOpzioni = mieGruppi[dim].get(ruoli) ?? [];
        for (const cedo of mieOpzioni) {
          const vCedo = somma(cedo, valoreMercato);
          const puntiCedo = somma(cedo, valore);
          for (const ricevo of loroOpzioni) {
            const equita = vCedo / somma(ricevo, valoreMercato);
            if (equita < SOGLIE.equitaMin || equita > SOGLIE.equitaMax) continue;
            // se ricevo molto meno di quanto cedo, nessuna esigenza di rosa lo compensa
            if (somma(ricevo, valore) - puntiCedo < -0.6) continue;
            const s = valutaScambio(mia, altra.rosa, cedo, ricevo, altra.nome, ctx, prima);
            if (
              s.deltaMio >= SOGLIE.guadagnoMinimo &&
              s.pAccetta >= SOGLIE.accettazioneMinima &&
              s.deltaLoro > -SOGLIE.perditaMassimaLoro
            ) {
              risultati.push(s);
            }
          }
        }
      }
    }
  }
  risultati.sort((x, y) => y.deltaMio * y.pAccetta - x.deltaMio * x.pAccetta);
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
