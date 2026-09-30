import type { FormazioneSquadra } from "./probabili.ts";
import type { Forma, Giocatore, Partita } from "./types.ts";

/*
 * Pronostico statistico di una partita, dai gol attesi di casa e trasferta (dalle quote dei
 * bookmaker quando ci sono, altrimenti stimati dalla forza delle squadre): gol di Poisson
 * indipendenti, lo stesso modello delle probabilità 1X2 mostrate.
 *
 * Non sono consigli di scommessa: su Serie A e bookmaker italiani il nostro backtest
 * (2021-2026) non trova vantaggi sulle quote.
 */

const MAX_GOL = 10;

function poisson(lambda: number): number[] {
  const out = [Math.exp(-lambda)];
  for (let k = 1; k <= MAX_GOL; k++) out.push((out[k - 1] * lambda) / k);
  // oltre MAX_GOL resta una probabilità trascurabile: si normalizza perché i mercati sommino a 1
  const totale = out.reduce((x, y) => x + y, 0);
  return out.map((x) => x / totale);
}

export interface Risultato {
  casa: number;
  trasferta: number;
  p: number;
}

export interface Pronostico {
  golAttesi: number;
  risultati: Risultato[];
  over15: number;
  over25: number;
  over35: number;
  entrambeSegnano: number;
  /** Probabilità che la squadra non subisca gol. */
  portaInviolataCasa: number;
  portaInviolataTrasferta: number;
}

export function pronostico(p: Partita): Pronostico {
  const pc = poisson(p.xg_casa);
  const pt = poisson(p.xg_trasferta);
  const risultati: Risultato[] = [];
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let entrambe = 0;
  pc.forEach((a, i) =>
    pt.forEach((b, j) => {
      const q = a * b;
      risultati.push({ casa: i, trasferta: j, p: q });
      if (i + j > 1.5) over15 += q;
      if (i + j > 2.5) over25 += q;
      if (i + j > 3.5) over35 += q;
      if (i > 0 && j > 0) entrambe += q;
    }),
  );
  risultati.sort((x, y) => y.p - x.p);
  return {
    golAttesi: p.xg_casa + p.xg_trasferta,
    risultati: risultati.slice(0, 4),
    over15,
    over25,
    over35,
    entrambeSegnano: entrambe,
    portaInviolataCasa: pt[0],
    portaInviolataTrasferta: pc[0],
  };
}

// ---------- Giocatori da seguire ----------

export interface Evidenza {
  g: Giocatore;
  p: number;
}

const almenoUno = (media: number) => 1 - Math.exp(-media);

/** Probabilità che segni almeno un gol (rigori compresi): gioca × P(almeno un gol se gioca). */
export const pGol = (g: Giocatore) => g.p_gioca * almenoUno(g.giornata.gol + g.giornata.rigori_segnati);
export const pAssist = (g: Giocatore) => g.p_gioca * almenoUno(g.giornata.assist);
export const pCartellino = (g: Giocatore) => g.p_gioca * Math.min(1, g.giornata.ammonito + g.giornata.espulso);

export function migliori(giocatori: Giocatore[], f: (g: Giocatore) => number, quanti: number): Evidenza[] {
  return giocatori
    .map((g) => ({ g, p: f(g) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, quanti);
}

// ---------- Forma e frasi ----------

export function riassuntoForma(forma: Forma[]): { vinte: number; pari: number; perse: number; fatti: number; subiti: number } {
  return {
    vinte: forma.filter((x) => x.esito === "V").length,
    pari: forma.filter((x) => x.esito === "N").length,
    perse: forma.filter((x) => x.esito === "P").length,
    fatti: forma.reduce((s, x) => s + x.fatti, 0),
    subiti: forma.reduce((s, x) => s + x.subiti, 0),
  };
}

const pc = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => x.toFixed(1).replace(".", ",");

/** Una cosa da sapere: il numero chiave in grande, un titolo breve e una riga di spiegazione. */
export interface DaSapere {
  tipo: "esito" | "gol" | "risultato" | "porta" | "marcatore" | "ballottaggi" | "forma";
  valore: string;
  titolo: string;
  testo: string;
  giocatore?: Giocatore;
  squadra?: string;
}

/** La frase sulla forma di una squadra, solo se dice qualcosa di netto. */
function schedaForma(squadra: string, forma: Forma[]): DaSapere | null {
  if (forma.length < 3) return null;
  const r = riassuntoForma(forma);
  const n = forma.length;
  const serie = forma.map((x) => x.esito).join("");
  if (r.vinte === 0) return { tipo: "forma", valore: serie, titolo: `${squadra} senza vittorie`, testo: `Nelle ultime ${n}: ${r.fatti} gol fatti e ${r.subiti} subiti.`, squadra };
  if (r.perse === 0) return { tipo: "forma", valore: serie, titolo: `${squadra} imbattuta`, testo: `${r.vinte} vittorie nelle ultime ${n}, ${r.fatti} gol fatti.`, squadra };
  if (r.vinte >= n - 1) return { tipo: "forma", valore: serie, titolo: `${squadra} in forma`, testo: `${r.vinte} vittorie nelle ultime ${n}, ${r.fatti} gol fatti e ${r.subiti} subiti.`, squadra };
  if (r.subiti / n >= 2) return { tipo: "forma", valore: num(r.subiti / n), titolo: `${squadra}: difesa in difficoltà`, testo: `Gol subiti a partita nelle ultime ${n} (${r.subiti} in tutto).`, squadra };
  if (r.fatti / n >= 2) return { tipo: "forma", valore: num(r.fatti / n), titolo: `${squadra}: attacco in forma`, testo: `Gol fatti a partita nelle ultime ${n} (${r.fatti} in tutto).`, squadra };
  return null;
}

/** Le cose da sapere sulla partita, in ordine di importanza. */
export function daSapere(p: Partita, pr: Pronostico, casa: FormazioneSquadra | null, trasferta: FormazioneSquadra | null): DaSapere[] {
  const out: DaSapere[] = [];
  const [fav, pFav] = p.p1 >= p.p2 ? [p.casa, p.p1] : [p.trasferta, p.p2];
  const tutte = `${p.casa} ${pc(p.p1)} · pareggio ${pc(p.px)} · ${p.trasferta} ${pc(p.p2)}`;
  if (pFav >= 0.55) out.push({ tipo: "esito", valore: pc(pFav), titolo: `${fav} favorita`, testo: tutte, squadra: fav });
  else if (Math.abs(p.p1 - p.p2) < 0.1) out.push({ tipo: "esito", valore: pc(p.px), titolo: "Partita equilibrata: pareggio probabile", testo: tutte });
  else out.push({ tipo: "esito", valore: pc(pFav), titolo: `${fav} leggermente favorita`, testo: tutte, squadra: fav });

  out.push({
    tipo: "gol",
    valore: num(pr.golAttesi),
    titolo: pr.over25 >= 0.55 ? "gol attesi: partita da gol" : pr.over25 <= 0.45 ? "gol attesi: partita chiusa" : "gol attesi",
    testo: pr.over25 >= 0.55 || pr.over25 <= 0.45
      ? `Più di 2 gol nel ${pc(pr.over25)} dei casi, segnano entrambe nel ${pc(pr.entrambeSegnano)}.`
      : `Più o meno di 2 gol è un testa o croce: ${pc(pr.over25)} contro ${pc(1 - pr.over25)}.`,
  });

  const [r1, r2] = pr.risultati;
  out.push({
    tipo: "risultato",
    valore: `${r1.casa}-${r1.trasferta}`,
    titolo: "il risultato più probabile",
    testo: `Solo il ${pc(r1.p)} delle volte, poi ${r2.casa}-${r2.trasferta} (${pc(r2.p)}).`,
  });

  const inviolata = pr.portaInviolataCasa >= pr.portaInviolataTrasferta
    ? { squadra: p.casa, p: pr.portaInviolataCasa, f: casa }
    : { squadra: p.trasferta, p: pr.portaInviolataTrasferta, f: trasferta };
  const portiere = inviolata.f?.titolari.find((g) => g.ruolo === "P");
  if (inviolata.p >= 0.25) {
    out.push({
      tipo: "porta",
      valore: pc(inviolata.p),
      titolo: portiere ? portiere.nome : inviolata.squadra,
      testo: `Per il fanta: il portiere con più probabilità di non subire gol (${inviolata.squadra}).`,
      giocatore: portiere,
      squadra: inviolata.squadra,
    });
  }

  const titolari = [...(casa?.titolari ?? []), ...(trasferta?.titolari ?? [])];
  const [bomber] = migliori(titolari, pGol, 1);
  if (bomber) {
    out.push({
      tipo: "marcatore",
      valore: pc(bomber.p),
      titolo: bomber.g.nome,
      testo: `Il più probabile marcatore della partita (${bomber.g.squadra}).`,
      giocatore: bomber.g,
      squadra: bomber.g.squadra,
    });
  }

  for (const [squadra, f] of [[p.casa, casa], [p.trasferta, trasferta]] as const) {
    const n = f?.ballottaggi.length ?? 0;
    if (n >= 3) out.push({ tipo: "ballottaggi", valore: String(n), titolo: `${squadra}: ${n} ballottaggi`, testo: "Formazione ancora incerta: controlla prima di schierare.", squadra });
  }

  for (const [squadra, forma] of [[p.casa, p.forma_casa ?? []], [p.trasferta, p.forma_trasferta ?? []]] as const) {
    const scheda = schedaForma(squadra, forma);
    if (scheda) out.push(scheda);
  }
  return out.slice(0, MAX_SCHEDE);
}

/** Le schede più importanti bastano: di più allungherebbero la riga dei riquadri accanto. */
const MAX_SCHEDE = 6;

// ---------- Mercati, quote eque e pronostico statistico (pagina Pronostici) ----------

/** Probabilità di ogni risultato esatto fino a 5 gol per squadra: [gol casa][gol trasferta]. */
export function matriceRisultati(p: Partita, max = 5): number[][] {
  const pc = poisson(p.xg_casa);
  const pt = poisson(p.xg_trasferta);
  return Array.from({ length: max + 1 }, (_, i) => Array.from({ length: max + 1 }, (_, j) => pc[i] * pt[j]));
}

export interface Mercato {
  /** Chiave usata anche per le quote dei bookmaker (1, X, 2, over25, under25). */
  chiave: string;
  gruppo: string;
  nome: string;
  p: number;
}

/** Tutti i mercati principali con la loro probabilità, dalla stessa matrice dei risultati. */
export function mercati(p: Partita): Mercato[] {
  const pc = poisson(p.xg_casa);
  const pt = poisson(p.xg_trasferta);
  const somma = (f: (i: number, j: number) => boolean) => {
    let s = 0;
    pc.forEach((a, i) => pt.forEach((b, j) => { if (f(i, j)) s += a * b; }));
    return s;
  };
  const uno = somma((i, j) => i > j);
  const ics = somma((i, j) => i === j);
  const due = somma((i, j) => i < j);
  const out: Mercato[] = [
    { chiave: "1", gruppo: "Esito finale", nome: `1 · vince ${p.casa}`, p: uno },
    { chiave: "X", gruppo: "Esito finale", nome: "X · pareggio", p: ics },
    { chiave: "2", gruppo: "Esito finale", nome: `2 · vince ${p.trasferta}`, p: due },
    { chiave: "1X", gruppo: "Doppia chance", nome: `1X · ${p.casa} non perde`, p: uno + ics },
    { chiave: "X2", gruppo: "Doppia chance", nome: `X2 · ${p.trasferta} non perde`, p: ics + due },
    { chiave: "12", gruppo: "Doppia chance", nome: "12 · non finisce pari", p: uno + due },
  ];
  for (const soglia of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    const over = somma((i, j) => i + j > soglia);
    const s = String(soglia).replace(".", ",");
    const k = String(soglia).replace(".", "");
    out.push({ chiave: `over${k}`, gruppo: "Under / Over", nome: `Over ${s}`, p: over });
    out.push({ chiave: `under${k}`, gruppo: "Under / Over", nome: `Under ${s}`, p: 1 - over });
  }
  const gg = somma((i, j) => i > 0 && j > 0);
  out.push({ chiave: "gg", gruppo: "Gol / No gol", nome: "Gol · segnano entrambe", p: gg });
  out.push({ chiave: "ng", gruppo: "Gol / No gol", nome: "No gol · almeno una non segna", p: 1 - gg });
  for (const [a, b] of [[1, 2], [1, 3], [2, 3], [2, 4], [3, 5]]) {
    out.push({ chiave: `mg${a}${b}`, gruppo: "Multigol", nome: `Multigol ${a}-${b}`, p: somma((i, j) => i + j >= a && i + j <= b) });
  }
  out.push({ chiave: "segna_casa", gruppo: "Squadra segna", nome: `Segna ${p.casa}`, p: 1 - pc[0] });
  out.push({ chiave: "segna_trasferta", gruppo: "Squadra segna", nome: `Segna ${p.trasferta}`, p: 1 - pt[0] });
  return out;
}

/** Quota equa: quella senza margine del bookmaker, 1 / probabilità. */
export const quotaEqua = (p: number) => (p > 0 ? 1 / p : Infinity);

export interface Scelta {
  titolo: string;
  mercato: Mercato;
}

/**
 * Pronostico statistico: per ogni tipo di mercato l'esito più probabile (esito finale,
 * doppia chance, under/over 2,5, gol/no gol, multigol) e il risultato esatto più probabile.
 * Sono le previsioni del modello, non consigli di gioco.
 */
export function pronosticoStatistico(m: Mercato[], p?: Partita): Scelta[] {
  const top = (xs: Mercato[]) => xs.reduce((a, b) => (b.p > a.p ? b : a));
  const di = (g: string) => m.filter((x) => x.gruppo === g);
  const scelte: Scelta[] = [
    { titolo: "Esito finale", mercato: top(di("Esito finale")) },
    { titolo: "Doppia chance", mercato: top(di("Doppia chance")) },
    { titolo: "Under / over 2,5", mercato: top(m.filter((x) => x.chiave === "over25" || x.chiave === "under25")) },
    { titolo: "Gol / no gol", mercato: top(di("Gol / No gol")) },
    { titolo: "Multigol", mercato: top(di("Multigol")) },
  ];
  if (p) {
    const [r] = pronostico(p).risultati;
    scelte.push({ titolo: "Risultato esatto", mercato: { chiave: `esatto${r.casa}${r.trasferta}`, gruppo: "Risultato esatto", nome: `${r.casa}-${r.trasferta}`, p: r.p } });
  }
  return scelte;
}
