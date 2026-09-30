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

function fraseForma(squadra: string, forma: Forma[]): string | null {
  if (!forma.length) return null;
  const r = riassuntoForma(forma);
  const parti = [r.vinte && `${r.vinte} ${r.vinte === 1 ? "vittoria" : "vittorie"}`, r.pari && `${r.pari} ${r.pari === 1 ? "pareggio" : "pareggi"}`, r.perse && `${r.perse} ${r.perse === 1 ? "sconfitta" : "sconfitte"}`].filter(Boolean);
  return `${squadra} nelle ultime ${forma.length}: ${parti.join(", ")}, ${r.fatti} gol fatti e ${r.subiti} subiti.`;
}

/** Le cose da sapere sulla partita, in frasi brevi e in ordine di importanza. */
export function frasi(p: Partita, pr: Pronostico, casa: FormazioneSquadra | null, trasferta: FormazioneSquadra | null): string[] {
  const out: string[] = [];
  const [fav, pFav, altra] = p.p1 >= p.p2 ? [p.casa, p.p1, p.trasferta] : [p.trasferta, p.p2, p.casa];
  if (pFav >= 0.55) out.push(`${fav} favorita: vince nel ${pc(pFav)} dei casi, il pareggio è al ${pc(p.px)}.`);
  else if (Math.abs(p.p1 - p.p2) < 0.1) out.push(`Partita equilibrata: ${p.casa} ${pc(p.p1)}, pareggio ${pc(p.px)}, ${p.trasferta} ${pc(p.p2)}.`);
  else out.push(`Leggermente favorita ${fav} (${pc(pFav)}) su ${altra}, pareggio al ${pc(p.px)}.`);

  if (pr.over25 >= 0.55) out.push(`Partita da gol: ${num(pr.golAttesi)} gol attesi, più di 2 gol nel ${pc(pr.over25)} dei casi.`);
  else if (pr.over25 <= 0.45) out.push(`Pochi gol attesi (${num(pr.golAttesi)}): al massimo 2 gol nel ${pc(1 - pr.over25)} dei casi.`);
  else out.push(`${num(pr.golAttesi)} gol attesi: più o meno di 2 gol è quasi un testa o croce (${pc(pr.over25)} più di 2).`);

  const [r1] = pr.risultati;
  out.push(`Il risultato più probabile è ${r1.casa}-${r1.trasferta} (${pc(r1.p)}): anche il più probabile succede raramente.`);

  const inviolata = pr.portaInviolataCasa >= pr.portaInviolataTrasferta
    ? { squadra: p.casa, p: pr.portaInviolataCasa, f: casa }
    : { squadra: p.trasferta, p: pr.portaInviolataTrasferta, f: trasferta };
  const portiere = inviolata.f?.titolari.find((g) => g.ruolo === "P");
  if (inviolata.p >= 0.3) {
    out.push(`Per il fanta: ${portiere ? `${portiere.nome} (${inviolata.squadra})` : inviolata.squadra} ha la porta inviolata più probabile, ${pc(inviolata.p)}.`);
  }

  const titolari = [...(casa?.titolari ?? []), ...(trasferta?.titolari ?? [])];
  const [bomber] = migliori(titolari, pGol, 1);
  if (bomber) out.push(`Il più probabile marcatore è ${bomber.g.nome} (${bomber.g.squadra}): segna nel ${pc(bomber.p)} dei casi.`);

  for (const [squadra, f] of [[p.casa, casa], [p.trasferta, trasferta]] as const) {
    const n = f?.ballottaggi.length ?? 0;
    if (n >= 3) out.push(`${squadra}: ${n} ballottaggi aperti, formazione ancora incerta.`);
  }

  for (const [squadra, forma] of [[p.casa, p.forma_casa ?? []], [p.trasferta, p.forma_trasferta ?? []]] as const) {
    const frase = fraseForma(squadra, forma);
    if (frase) out.push(frase);
  }
  return out;
}
