"use client";

import { useEffect, useState } from "react";

import { rosaDi, type Squadra } from "@/lib/league";
import { decodificaImport, regoleDaLeghe, roseDaLeghe, ruoliDaLeghe, type Nota } from "@/lib/leghe";
import { REGOLE_STANDARD, type Regole } from "@/lib/rules";
import { RUOLI, type Giocatore, type Ruolo } from "@/lib/types";

/*
 * La lega salvata nel browser, condivisa dalle pagine "La mia lega" e "Scambi".
 */

const CHIAVE = "chi-schiero-lega-v2";
/** Versione della lettura delle impostazioni di Leghe Fantacalcio: se cambia, le regole importate si ricalcolano. */
const VERSIONE_LETTURA = 2;
const COMPOSIZIONE: Record<Ruolo, number> = { P: 3, D: 8, C: 8, A: 6 };

export interface LegaSalvata {
  squadre: Squadra[];
  mia: string | null;
  regole: Regole;
  /** Ruoli diversi dal listone letti da Leghe Fantacalcio (id giocatore → ruolo). */
  ruoli?: Record<number, Ruolo>;
  /**
   * Se usare quei ruoli. Spento di default: l'elenco di Leghe Fantacalcio non è sicuramente
   * quello della lega (due leghe diverse hanno restituito lo stesso numero di voci), e con i
   * ruoli sbagliati gli scambi proposti non rispettano la composizione delle rose.
   */
  usaRuoliLega?: boolean;
  /** Presente se la lega arriva da Leghe Fantacalcio. */
  origine?: {
    lega: string;
    importata: string;
    note: Nota[];
    fuoriListone: number;
    impostazioni: unknown;
    versione?: number;
  };
}

/** Rosa con i ruoli della lega applicati. */
export function rosaLega(squadra: Squadra, perId: Map<number, Giocatore>, ruoli: Record<number, Ruolo> = {}): Giocatore[] {
  return rosaDi(squadra, perId).map((g) => (ruoli[g.id] && ruoli[g.id] !== g.ruolo ? { ...g, ruolo: ruoli[g.id] } : g));
}

/** Se l'URL porta dati dal segnalibro, li trasforma in una lega (e pulisce l'URL). */
export function daSegnalibro(giocatori: Giocatore[], precedente: LegaSalvata | null): LegaSalvata | null {
  if (typeof window === "undefined" || !window.location.hash.includes("importa=")) return null;
  const dati = decodificaImport(window.location.hash);
  window.history.replaceState(null, "", window.location.pathname);
  if (!dati) return null;
  const rose = roseDaLeghe(dati, giocatori);
  const { regole, note } = regoleDaLeghe(dati.impostazioni);
  const miaPrima = precedente?.mia && rose.squadre.some((s) => s.nome === precedente.mia) ? precedente.mia : null;
  return {
    squadre: rose.squadre,
    mia: rose.mia ?? miaPrima,
    regole,
    ruoli: ruoliDaLeghe(dati.impostazioni.ruoli),
    origine: {
      lega: dati.lega.nome,
      importata: new Date().toISOString(),
      note,
      fuoriListone: rose.fuoriListone,
      impostazioni: { calcolo: dati.impostazioni.calcolo, formazione: dati.impostazioni.formazione },
      versione: VERSIONE_LETTURA,
    },
  };
}

export function leggi(): LegaSalvata | null {
  try {
    const raw = localStorage.getItem(CHIAVE);
    if (!raw) return null;
    const l = JSON.parse(raw) as LegaSalvata;
    const lega = { ...l, regole: { ...REGOLE_STANDARD, ...l.regole } };
    if (lega.origine && lega.origine.versione !== VERSIONE_LETTURA) {
      // importata con una lettura precedente delle impostazioni: si rilegge dagli originali salvati
      const imp = lega.origine.impostazioni as { calcolo: Record<string, unknown> | null; formazione: Record<string, unknown> | null };
      const { regole, note } = regoleDaLeghe({ calcolo: imp?.calcolo ?? null, formazione: imp?.formazione ?? null, ruoli: null });
      lega.regole = regole;
      lega.origine = { ...lega.origine, note, versione: VERSIONE_LETTURA };
      salva(lega);
    }
    return lega;
  } catch {
    return null;
  }
}

export function salva(lega: LegaSalvata | null) {
  try {
    if (lega) localStorage.setItem(CHIAVE, JSON.stringify(lega));
    else localStorage.removeItem(CHIAVE);
  } catch {
    // archiviazione non disponibile (navigazione privata): la lega resta solo in questa pagina
  }
}


/** Lega di esempio: 8 squadre con rose 3/8/8/6 distribuite a serpentina tra i giocatori più forti. */
export function legaEsempio(giocatori: Giocatore[]): LegaSalvata {
  const nomi = ["Atletico Ma Non Troppo", "Real Mente", "Longobarda", "Dinamo Divano", "Sporting Lesione", "Bayern Monaco di Baviera", "Paris Saint Gennaro", "Inter Nos"];
  const squadre = nomi.map((nome) => ({ nome, ids: [] as number[] }));
  for (const r of RUOLI) {
    const pool = giocatori.filter((g) => g.ruolo === r).sort((a, b) => (b.fvm ?? 0) - (a.fvm ?? 0));
    let i = 0;
    for (let giro = 0; giro < COMPOSIZIONE[r]; giro++) {
      const ordine = giro % 2 === 0 ? squadre : [...squadre].reverse();
      for (const s of ordine) s.ids.push(pool[i++].id);
    }
  }
  return { squadre, mia: nomi[0], regole: REGOLE_STANDARD };
}

/** Carica la lega salvata (e quella in arrivo dal segnalibro, se c'è). */
export function useLega(giocatori: Giocatore[]) {
  const [lega, setLega] = useState<LegaSalvata | null>(null);
  const [caricata, setCaricata] = useState(false);

  useEffect(() => {
    const salvata = leggi();
    const importata = daSegnalibro(giocatori, salvata);
    if (importata) salva(importata);
    setLega(importata ?? salvata);
    setCaricata(true);
  }, [giocatori]);

  const aggiorna = (l: LegaSalvata | null) => {
    setLega(l);
    salva(l);
  };
  return { lega, aggiorna, caricata };
}

/** Rose della lega con i ruoli scelti (listone o Leghe Fantacalcio). */
export function roseDellaLega(lega: LegaSalvata, perId: Map<number, Giocatore>) {
  const ruoli = lega.usaRuoliLega ? lega.ruoli : undefined;
  const mia = lega.squadre.find((s) => s.nome === lega.mia) ?? null;
  return {
    mia: mia ? rosaLega(mia, perId, ruoli) : null,
    altre: lega.squadre.filter((s) => s.nome !== lega.mia).map((s) => ({ nome: s.nome, rosa: rosaLega(s, perId, ruoli) })),
  };
}
