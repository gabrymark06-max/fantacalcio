import { REGOLE_STANDARD, TUTTI_I_MODULI, type Fascia, type Regole } from "./rules.ts";
import type { Giocatore, Ruolo } from "./types.ts";

/*
 * Importazione da Leghe Fantacalcio (leghe.fantacalcio.it).
 *
 * Il segnalibro (bookmarklet.ts) gira nella pagina della lega, con la sessione dell'utente,
 * legge l'API interna del sito e passa i dati a Chi Schiero nel frammento dell'URL
 * (#importa=...): il frammento non viene mai inviato a nessun server.
 *
 * Campi di settings/calculate (nomi da fantabot, github.com/SilvioBaratto/fantabot, MIT;
 * formato verificato su una lega Classic reale, settembre 2026):
 *   - `count`: numero di ruoli (4 nel Classic). Ogni voce di `bnMls` è una lista con un valore
 *     per ruolo, nell'ordine P, D, C, A (es. bmgs [5, 3, 3, 3] = gol del portiere +5);
 *     `bmcsh` può essere un numero singolo;
 *   - bnMls: bmgs gol, bmass/bmasf/bmasg assist, bmyc ammonizione, bmrc espulsione, bmog
 *     autorete, bmpsc rigore segnato, bmpns rigore sbagliato, bmpsa rigore parato, bmgc gol
 *     subito, bmcsh imbattibilità del portiere, motm player of the match, bmdg gol decisivo,
 *     bmeg gol del pareggio;
 *   - smodd, modificatore difesa: fasce da `smodld` a `smodlu`; `smodva` ha un valore per
 *     "sotto la prima soglia", uno per ogni fascia intermedia e uno per "da smodlu in su".
 *     Con smodld 6, smodlu 7 e 6 valori le soglie sono 6; 6,25; 6,5; 6,75; 7;
 *   - custom-roles: ruoli cambiati dalla lega, 1..4 = P, D, C, A;
 *   - settings/lineup → mods: moduli ammessi ("343", "352", ...).
 * Non modellati (segnalati all'utente): gol decisivo e del pareggio, modificatore capitano e
 * gli altri modificatori (smodg, smodm, smodf, ...).
 */

export interface SquadraLeghe {
  nome: string;
  proprietario: number | null;
  ids: number[];
  costi: number[];
}

export interface DatiLeghe {
  v: number;
  lega: { nome: string; alias?: string };
  utente: number | null;
  squadre: SquadraLeghe[];
  impostazioni: {
    calcolo: Record<string, unknown> | null;
    formazione: Record<string, unknown> | null;
    ruoli: unknown;
  };
}

export function decodificaImport(frammento: string): DatiLeghe | null {
  const m = frammento.match(/importa=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const testo = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const dati = JSON.parse(testo) as DatiLeghe;
    return Array.isArray(dati.squadre) ? dati : null;
  } catch {
    return null;
  }
}

export function codificaImport(dati: DatiLeghe): string {
  const bytes = new TextEncoder().encode(JSON.stringify(dati));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface Nota {
  tipo: "ok" | "controlla";
  testo: string;
}

const ORDINE_RUOLI: Ruolo[] = ["P", "D", "C", "A"];
const fmt = (x: number) => String(x).replace(".", ",");
const conSegno = (x: number) => (x > 0 ? `+${fmt(x)}` : fmt(x));

/**
 * Valore di una voce bnMls per ruolo. Formati visti:
 *   - numero singolo → uguale per tutti i ruoli;
 *   - lista lunga quanto `count` (4) → un valore per ruolo, ordine P, D, C, A;
 *   - coppia (altre leghe, significato ignoto) → se diversa, si usa il primo e si segnala.
 */
function perRuolo(bn: Record<string, unknown>, chiave: string, ruoli: number): { valori: Record<Ruolo, number>; ignoto: boolean } | null {
  const v = bn[chiave];
  const uguale = (x: number) => ({ valori: { P: x, D: x, C: x, A: x }, ignoto: false });
  if (typeof v === "number") return uguale(v);
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === "number")) return null;
  const nums = v as number[];
  if (nums.length === ruoli && ruoli === 4) {
    return { valori: { P: nums[0], D: nums[1], C: nums[2], A: nums[3] }, ignoto: false };
  }
  return { ...uguale(nums[0]), ignoto: new Set(nums).size > 1 };
}

const tuttiUguali = (r: Record<Ruolo, number>) => new Set(ORDINE_RUOLI.map((x) => r[x])).size === 1;
const descriviPerRuolo = (r: Record<Ruolo, number>) => ORDINE_RUOLI.map((x) => `${x} ${conSegno(r[x])}`).join(", ");

/**
 * Voci che nel nostro modello hanno un solo valore. Se la lega le differenzia per ruolo si usa
 * il ruolo che conta di più per quella voce (il portiere per gol subiti e rigori parati).
 */
const CAMPI_SEMPLICI: { chiave: string; campo: keyof Regole; nome: string; ruolo?: Ruolo }[] = [
  { chiave: "bmpsc", campo: "rigoreSegnato", nome: "rigore segnato" },
  { chiave: "bmyc", campo: "ammonizione", nome: "ammonizione" },
  { chiave: "bmrc", campo: "espulsione", nome: "espulsione" },
  { chiave: "bmog", campo: "autorete", nome: "autorete" },
  { chiave: "bmpns", campo: "rigoreSbagliato", nome: "rigore sbagliato" },
  { chiave: "bmpsa", campo: "rigoreParato", nome: "rigore parato", ruolo: "P" },
  { chiave: "bmgc", campo: "golSubito", nome: "gol subito", ruolo: "P" },
  { chiave: "bmcsh", campo: "imbattibilita", nome: "imbattibilità del portiere", ruolo: "P" },
  { chiave: "motm", campo: "playerOfTheMatch", nome: "player of the match" },
];

/** Moduli nel formato di Leghe Fantacalcio ("343", "3-4-3", 343) → quelli che conosciamo. */
export function moduliDaLeghe(formazione: Record<string, unknown> | null): string[] | null {
  if (!formazione) return null;
  const trovati = new Set<string>();
  const visita = (x: unknown) => {
    if (typeof x === "string" || typeof x === "number") {
      const cifre = String(x).replace(/\D/g, "");
      if (cifre.length === 3) {
        const m = `${cifre[0]}-${cifre[1]}-${cifre[2]}`;
        if (TUTTI_I_MODULI.includes(m)) trovati.add(m);
      }
    } else if (Array.isArray(x)) x.forEach(visita);
    else if (x && typeof x === "object") Object.values(x).forEach(visita);
  };
  visita(formazione.mods ?? formazione.modules ?? null);
  return trovati.size ? TUTTI_I_MODULI.filter((m) => trovati.has(m)) : null;
}

/**
 * Fasce del modificatore difesa da smodd: soglie equidistanti da smodld a smodlu, un valore
 * sotto la prima soglia (se non è zero diventa una fascia "da 0") e uno per ogni soglia.
 */
export function fasceDaSmodd(smodd: Record<string, unknown>): Fascia[] | null {
  const da = Number(smodd.smodld);
  const a = Number(smodd.smodlu);
  const valori = smodd.smodva;
  if (!Number.isFinite(da) || !Number.isFinite(a) || !Array.isArray(valori) || valori.length < 3) return null;
  const nums = valori.map(Number);
  if (nums.some((x) => !Number.isFinite(x)) || a <= da) return null;
  const passo = (a - da) / (nums.length - 2);
  const fasce: Fascia[] = nums.slice(1).map((bonus, i) => ({ da: Math.round((da + i * passo) * 100) / 100, bonus }));
  if (nums[0] !== 0) fasce.unshift({ da: 0, bonus: nums[0] });
  return fasce;
}

const MODIFICATORI_NON_GESTITI: Record<string, string> = {
  smodcp: "modificatore capitano",
  smodg: "modificatore portiere",
  smodm: "modificatore centrocampo",
  smodf: "modificatore attacco",
  smodl: "modificatore modulo",
  smodp: "fattore rendimento",
  skodm: "modificatore",
};

/** Traduce le impostazioni di calcolo nelle nostre regole, dicendo cosa è certo e cosa no. */
export function regoleDaLeghe(imp: DatiLeghe["impostazioni"], base: Regole = REGOLE_STANDARD): { regole: Regole; note: Nota[] } {
  const note: Nota[] = [];
  const regole: Regole = structuredClone(base);
  const calcolo = imp.calcolo;
  const bn = (calcolo?.bnMls ?? null) as Record<string, unknown> | null;
  const ruoli = Number(calcolo?.count) || 4;

  if (!bn) {
    note.push({ tipo: "controlla", testo: "Tabella bonus e malus non trovata: restano le regole standard, controllale qui sotto." });
  } else {
    const gol = perRuolo(bn, "bmgs", ruoli);
    if (gol) {
      regole.gol = gol.valori;
      if (gol.ignoto) note.push({ tipo: "controlla", testo: `Bonus gol in un formato che non conosciamo (${JSON.stringify(bn.bmgs)}): usato il primo valore.` });
      else if (!tuttiUguali(gol.valori)) note.push({ tipo: "ok", testo: `Bonus gol per ruolo: ${descriviPerRuolo(gol.valori)}.` });
    }

    // tre tipi di assist (in movimento, da fermo, ...): il modello ne ha uno solo
    const assist = ["bmass", "bmasf", "bmasg"]
      .map((k) => perRuolo(bn, k, ruoli))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .flatMap((x) => ORDINE_RUOLI.filter((r) => r !== "P").map((r) => x.valori[r]));
    if (assist.length) {
      const diversi = [...new Set(assist)];
      regole.assist = diversi.reduce((s, v) => s + v, 0) / diversi.length;
      if (diversi.length > 1) {
        note.push({ tipo: "controlla", testo: `La lega dà valori diversi agli assist (${diversi.map(conSegno).join(" / ")}): usata la media, ${conSegno(regole.assist)}.` });
      }
    }

    for (const c of CAMPI_SEMPLICI) {
      const p = perRuolo(bn, c.chiave, ruoli);
      if (!p) continue;
      const valore = c.ruolo ? p.valori[c.ruolo] : p.valori.A;
      (regole[c.campo] as number) = valore;
      if (p.ignoto) note.push({ tipo: "controlla", testo: `Il ${c.nome} è in un formato che non conosciamo (${JSON.stringify(bn[c.chiave])}): usato il primo valore.` });
      else if (!c.ruolo && !tuttiUguali(p.valori)) {
        note.push({ tipo: "controlla", testo: `Il ${c.nome} cambia per ruolo (${descriviPerRuolo(p.valori)}): usato ${conSegno(valore)} per tutti.` });
      }
    }

    const nonPrevisti: string[] = [];
    for (const [chiave, nome] of [["bmdg", "gol decisivo"], ["bmeg", "gol del pareggio"]]) {
      const p = perRuolo(bn, chiave, ruoli);
      if (p && ORDINE_RUOLI.some((r) => p.valori[r] !== 0)) nonPrevisti.push(`${nome} ${conSegno(p.valori.A)}`);
    }
    if (nonPrevisti.length) {
      note.push({
        tipo: "controlla",
        testo: `Bonus che non possiamo prevedere (i voti storici non dicono quali gol sono decisivi): ${nonPrevisti.join(", ")}. Premiano comunque chi segna, cioè gli stessi giocatori che il modello già valuta per i gol: per questo li trascuriamo.`,
      });
    }
    note.push({ tipo: "ok", testo: "Bonus e malus importati dalla lega." });
  }

  const moduli = moduliDaLeghe(imp.formazione);
  if (moduli) {
    regole.moduli = moduli;
    note.push({ tipo: "ok", testo: `Moduli ammessi: ${moduli.join(", ")}.` });
  } else {
    note.push({ tipo: "controlla", testo: "Moduli ammessi non riconosciuti: restano tutti, controllali qui sotto." });
  }

  const smodd = calcolo?.smodd as Record<string, unknown> | null | undefined;
  if (smodd) {
    const fasce = fasceDaSmodd(smodd);
    if (fasce) {
      regole.modificatoreDifesa = { ...regole.modificatoreDifesa, attivo: true, fasce, migliori: 3, conPortiere: true };
      note.push({
        tipo: "ok",
        testo: `Modificatore difesa attivo: ${fasce.map((f) => `da ${fmt(f.da)} ${conSegno(f.bonus)}`).join(", ")}. Media di portiere e 3 migliori difensori: se nella tua lega è diversa, cambiala qui sotto.`,
      });
    } else {
      note.push({ tipo: "controlla", testo: "Il modificatore difesa è attivo ma le sue fasce non si leggono: impostale qui sotto." });
    }
  }

  const altri = campiModificatori(calcolo).filter((k) => k !== "smodd" && k !== "stbdf");
  if (altri.length) {
    note.push({
      tipo: "controlla",
      testo: `Non ancora calcolati: ${altri.map((k) => MODIFICATORI_NON_GESTITI[k] ?? k).join(", ")}.`,
    });
  }
  return { regole, note };
}

/** Modificatori presenti (non vuoti) nelle impostazioni di calcolo. */
export function campiModificatori(calcolo: Record<string, unknown> | null): string[] {
  if (!calcolo) return [];
  return Object.entries(calcolo)
    .filter(([k, v]) => (k.startsWith("smod") || k.startsWith("skod") || k === "stbdf") && v !== null && v !== false && v !== 0 && v !== "")
    .map(([k]) => k);
}

const RUOLO_DA_CODICE: Record<number, Ruolo> = { 1: "P", 2: "D", 3: "C", 4: "A" };

/** Ruoli cambiati dalla lega: id giocatore → ruolo. */
export function ruoliDaLeghe(ruoli: unknown): Record<number, Ruolo> {
  const out: Record<number, Ruolo> = {};
  const lista = Array.isArray(ruoli) ? ruoli : Array.isArray((ruoli as { data?: unknown })?.data) ? (ruoli as { data: unknown[] }).data : [];
  for (const r of lista as { id?: number; role?: number }[]) {
    const ruolo = r.role !== undefined ? RUOLO_DA_CODICE[r.role] : undefined;
    if (r.id !== undefined && ruolo) out[r.id] = ruolo;
  }
  return out;
}

export interface RoseImportate {
  squadre: { nome: string; ids: number[] }[];
  mia: string | null;
  fuoriListone: number;
}

/** Rose con i soli giocatori del listone attuale (gli altri hanno lasciato la Serie A). */
export function roseDaLeghe(dati: DatiLeghe, giocatori: Giocatore[]): RoseImportate {
  const noti = new Set(giocatori.map((g) => g.id));
  let fuori = 0;
  const squadre = dati.squadre.map((s) => {
    const ids = s.ids.filter((id) => noti.has(id));
    fuori += s.ids.length - ids.length;
    return { nome: s.nome, ids };
  });
  const mia = dati.squadre.find((s) => dati.utente !== null && s.proprietario === dati.utente)?.nome ?? null;
  return { squadre, mia, fuoriListone: fuori };
}
