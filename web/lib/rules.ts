import type { Componenti, Giocatore, Ruolo } from "./types.ts";

/** Una fascia del modificatore difesa: da questa media in su vale `bonus` (fino alla fascia successiva). */
export interface Fascia {
  da: number;
  bonus: number;
}

export interface Regole {
  /** Bonus gol su azione per ruolo (in molte leghe il gol del difensore vale di più). */
  gol: Record<Ruolo, number>;
  rigoreSegnato: number;
  assist: number;
  golSubito: number;
  autorete: number;
  rigoreSbagliato: number;
  rigoreParato: number;
  ammonizione: number;
  espulsione: number;
  /** Bonus al portiere che non subisce gol (0 = non previsto). */
  imbattibilita: number;
  /** Bonus al player of the match (0 = non previsto). */
  playerOfTheMatch: number;
  modificatoreDifesa: {
    attivo: boolean;
    /** Difensori considerati nella media oltre al portiere (3 nella tabella classica). */
    migliori: 3 | 4;
    conPortiere: boolean;
    fasce: Fascia[];
  };
  /**
   * Modificatore capitano: bonus o malus secondo il voto puro del capitano (del vice se il
   * capitano non gioca). Assente nelle regole salvate prima che esistesse.
   */
  capitano?: {
    attivo: boolean;
    fasce: Fascia[];
  };
  /** Moduli che la lega permette di schierare. */
  moduli: string[];
}

export const TUTTI_I_MODULI = ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"];

/** Regole di fantacalcio.it: la formula del fantavoto verificata sui voti 2021/22–2026/27. */
export const REGOLE_STANDARD: Regole = {
  gol: { P: 3, D: 3, C: 3, A: 3 },
  rigoreSegnato: 3,
  assist: 1,
  golSubito: -1,
  autorete: -2,
  rigoreSbagliato: -3,
  rigoreParato: 3,
  ammonizione: -0.5,
  espulsione: -1,
  imbattibilita: 0,
  playerOfTheMatch: 0,
  modificatoreDifesa: {
    attivo: false,
    migliori: 3,
    conPortiere: true,
    // tabella classica: media 6 → +1, 6,5 → +3, 7 → +6
    fasce: [
      { da: 6, bonus: 1 },
      { da: 6.5, bonus: 3 },
      { da: 7, bonus: 6 },
    ],
  },
  capitano: {
    attivo: false,
    // tabella di Leghe Fantacalcio: voto sotto il 6 → −0,5, da 6 → 0, da 6,5 → +0,5
    fasce: [
      { da: 0, bonus: -0.5 },
      { da: 6, bonus: 0 },
      { da: 6.5, bonus: 0.5 },
    ],
  },
  moduli: TUTTI_I_MODULI,
};

/** Valori dello standard con cui è stato allenato fv_std: servono a calcolare le differenze. */
const STD = REGOLE_STANDARD;

/** giornata: la prossima partita; stagione: da qui a fine stagione (scambi e svincolati). */
export type Orizzonte = "giornata" | "stagione";

/**
 * Peso delle prossime giornate (avversari veri) nel valore stagionale. Più della loro quota
 * aritmetica (5 su ~33): sono le più certe, e rose e forma cambiano nel corso della stagione.
 */
export const PESO_PROSSIME = 0.4;

const misti = new WeakMap<Giocatore, Componenti>();

export function componenti(g: Giocatore, orizzonte: Orizzonte): Componenti {
  if (orizzonte === "giornata") return g.giornata;
  if (!g.prossime) return g.stagione;
  let c = misti.get(g);
  if (!c) {
    const p = g.prossime;
    c = Object.fromEntries(
      (Object.keys(g.stagione) as (keyof Componenti)[]).map((k) => [k, PESO_PROSSIME * (p[k] ?? g.stagione[k]) + (1 - PESO_PROSSIME) * g.stagione[k]]),
    ) as unknown as Componenti;
    misti.set(g, c);
  }
  return c;
}

/**
 * Fantavoto atteso se gioca, con le regole della lega:
 * fantavoto standard previsto + (bonus lega − bonus standard) × voce attesa.
 */
export function fantavotoRegole(g: Giocatore, r: Regole, orizzonte: Orizzonte): number {
  const c = componenti(g, orizzonte);
  return (
    c.fv_std +
    (r.gol[g.ruolo] - STD.gol[g.ruolo]) * c.gol +
    (r.rigoreSegnato - STD.rigoreSegnato) * c.rigori_segnati +
    (r.assist - STD.assist) * c.assist +
    (r.golSubito - STD.golSubito) * c.gol_subiti +
    (r.autorete - STD.autorete) * c.autoreti +
    (r.rigoreSbagliato - STD.rigoreSbagliato) * c.rigori_sbagliati +
    (r.rigoreParato - STD.rigoreParato) * c.rigori_parati +
    (r.ammonizione - STD.ammonizione) * c.ammonito +
    (r.espulsione - STD.espulsione) * c.espulso +
    r.imbattibilita * c.p_imbattuto +
    r.playerOfTheMatch * (c.potm ?? 0)
  );
}

// ---------- Modificatore difesa ----------

function cdfNormale(x: number): number {
  // Abramowitz–Stegun 7.1.26, errore < 1.5e-7
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Probabilità che almeno `k` di questi eventi indipendenti avvengano (Poisson-binomiale). */
export function almenoK(probabilita: number[], k: number): number {
  let dist = [1];
  for (const p of probabilita) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, i) => {
      next[i] += q * (1 - p);
      next[i + 1] += q * p;
    });
    dist = next;
  }
  return dist.slice(k).reduce((s, x) => s + x, 0);
}

/**
 * Aumento atteso della media dei migliori `m` su `n` voti rispetto alla media dei voti attesi,
 * in unità di deviazione standard (statistiche d'ordine di normali indipendenti).
 */
const RIALZO_MIGLIORI: Record<string, number> = { "3/3": 0, "3/4": 0.343, "3/5": 0.553, "4/4": 0, "4/5": 0.291 };

/**
 * Valore atteso del modificatore difesa per una formazione. Si applica solo con almeno 4
 * difensori a voto (titolari o entrati dalla panchina). La media dei voti puri (portiere + i
 * migliori difensori) è trattata come normale: il suo valore atteso usa i voti previsti,
 * la sua variabilità la deviazione standard dei voti per ruolo.
 */
export function modificatoreAtteso(
  titolari: Giocatore[],
  panchina: Giocatore[],
  r: Regole,
  orizzonte: Orizzonte,
  sdVoto: Record<Ruolo, number>,
): number {
  const md = r.modificatoreDifesa;
  if (!md.attivo) return 0;
  const difensori = titolari.filter((g) => g.ruolo === "D");
  if (difensori.length < 4) return 0;
  const portiere = titolari.find((g) => g.ruolo === "P");

  const riserve = panchina.filter((g) => g.ruolo === "D").slice(0, 2);
  const pApplica = almenoK([...difensori, ...riserve].map((g) => pGioca(g, orizzonte)), 4);

  const voti = difensori.map((g) => componenti(g, orizzonte).voto).sort((a, b) => b - a);
  const m = md.migliori;
  const rialzo = RIALZO_MIGLIORI[`${m}/${Math.min(difensori.length, 5)}`] ?? 0;
  const mediaDif = voti.slice(0, m).reduce((s, v) => s + v, 0) / m + rialzo * sdVoto.D;
  const nPor = md.conPortiere && portiere ? 1 : 0;
  const mediaTot = (mediaDif * m + (nPor ? componenti(portiere!, orizzonte).voto : 0)) / (m + nPor);
  const sd = Math.sqrt(m * sdVoto.D ** 2 + nPor * sdVoto.P ** 2) / (m + nPor);

  return pApplica * attesoFasce(mediaTot, sd, md.fasce);
}

/** Valore atteso di una tabella a fasce per un voto (o una media) normale di media e deviazione date. */
export function attesoFasce(media: number, sd: number, fasceLega: Fascia[]): number {
  const fasce = [...fasceLega].sort((a, b) => a.da - b.da);
  let atteso = 0;
  fasce.forEach((f, i) => {
    const pSopra = 1 - cdfNormale((f.da - media) / sd);
    const pSopraProssima = i + 1 < fasce.length ? 1 - cdfNormale((fasce[i + 1].da - media) / sd) : 0;
    atteso += f.bonus * (pSopra - pSopraProssima);
  });
  return atteso;
}

// ---------- Modificatore capitano ----------

/** Bonus atteso se `g` è il capitano e gioca: dipende dal suo voto puro. */
export function bonusCapitano(g: Giocatore, r: Regole, orizzonte: Orizzonte, sdVoto: Record<Ruolo, number>): number {
  const cap = r.capitano;
  if (!cap?.attivo) return 0;
  return attesoFasce(componenti(g, orizzonte).voto, sdVoto[g.ruolo], cap.fasce);
}

export interface SceltaCapitano {
  capitano: Giocatore;
  vice: Giocatore;
  /** Probabilità che capitano e vice prendano il voto più alto tra i titolari. */
  pMigliorCapitano: number;
  pMigliorVice: number;
  /** Modificatore atteso: del capitano se gioca, altrimenti del vice. */
  atteso: number;
}

const densitaNormale = (z: number) => Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);

/**
 * Probabilità che ogni titolare prenda il voto puro più alto della formazione (chi non gioca
 * non prende voto). Voti normali indipendenti, integrati su una griglia:
 * P(i migliore) = p_i ∫ f_i(x) Π_{j≠i} [(1 − p_j) + p_j F_j(x)] dx.
 */
export function probabilitaMigliorVoto(titolari: Giocatore[], orizzonte: Orizzonte, sdVoto: Record<Ruolo, number>): number[] {
  const voci = titolari.map((g) => ({ media: componenti(g, orizzonte).voto, sd: sdVoto[g.ruolo], p: pGioca(g, orizzonte) }));
  const DA = 3.5;
  const A = 9.5;
  const PASSI = 120;
  const dx = (A - DA) / PASSI;
  const out = voci.map(() => 0);
  for (let k = 0; k <= PASSI; k++) {
    const x = DA + k * dx;
    const q = voci.map((v) => 1 - v.p + v.p * cdfNormale((x - v.media) / v.sd));
    const prodotto = q.reduce((a, b) => a * b, 1);
    voci.forEach((v, i) => {
      if (q[i] <= 0) return;
      out[i] += (v.p * densitaNormale((x - v.media) / v.sd) / v.sd) * (prodotto / q[i]) * dx;
    });
  }
  return out;
}

/**
 * Capitano: il titolare con la probabilità più alta di prendere il voto migliore della
 * squadra; vice il secondo. Il valore atteso usa le fasce della lega:
 * p(capitano) × bonus(capitano) + (1 − p(capitano)) × p(vice) × bonus(vice).
 */
export function sceltaCapitano(
  titolari: Giocatore[],
  r: Regole,
  orizzonte: Orizzonte,
  sdVoto: Record<Ruolo, number>,
): SceltaCapitano | null {
  if (!r.capitano?.attivo || titolari.length < 2) return null;
  const pMiglior = probabilitaMigliorVoto(titolari, orizzonte, sdVoto);
  const ordine = titolari.map((g, i) => ({ g, p: pMiglior[i] })).sort((a, b) => b.p - a.p);
  const [c, v] = ordine;
  const pc = pGioca(c.g, orizzonte);
  const atteso = pc * bonusCapitano(c.g, r, orizzonte, sdVoto) + (1 - pc) * pGioca(v.g, orizzonte) * bonusCapitano(v.g, r, orizzonte, sdVoto);
  return { capitano: c.g, vice: v.g, pMigliorCapitano: c.p, pMigliorVice: v.p, atteso };
}

export function pGioca(g: Giocatore, orizzonte: Orizzonte): number {
  return orizzonte === "giornata" ? g.p_gioca : g.p_gioca_stagione ?? g.p_gioca;
}
