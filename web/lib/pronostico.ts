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
  return out;
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
  return out;
}
