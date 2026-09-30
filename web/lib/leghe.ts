import { REGOLE_STANDARD, TUTTI_I_MODULI, type Regole } from "./rules.ts";
import type { Giocatore, Ruolo } from "./types.ts";

/*
 * Importazione da Leghe Fantacalcio (leghe.fantacalcio.it).
 *
 * Il segnalibro (bookmarklet.ts) gira nella pagina della lega, con la sessione dell'utente,
 * legge l'API interna del sito e passa i dati a Chi Schiero nel frammento dell'URL
 * (#importa=...): il frammento non viene mai inviato a nessun server.
 *
 * Significato dei campi, da fantabot (github.com/SilvioBaratto/fantabot, MIT),
 * docs/leghe-api.md e domain/lineup/scoring.py, verificati là sulle partite calcolate:
 *   - league/teams: `cal` = id dei giocatori della rosa separati da ";", `cs` = crediti pagati;
 *   - settings/calculate → bnMls: bmgs gol, bmass/bmasf/bmasg assist, bmyc ammonizione,
 *     bmrc espulsione, bmog autorete, bmpsc rigore segnato, bmpns rigore sbagliato,
 *     bmpsa rigore parato, bmgc gol subito, bmcsh imbattibilità del portiere,
 *     motm player of the match, bmdg gol decisivo. Ogni valore è una coppia [x, y] di cui
 *     non si conosce il significato: se le due metà sono uguali non importa.
 *   - custom-roles: ruoli cambiati dalla lega, 1..4 = P, D, C, A.
 * I campi dei modificatori (smod*, stbdf) non sono ancora decifrati: vengono mostrati grezzi.
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

/** Valore di un campo bnMls: numero, o coppia con le due metà uguali. */
function peso(bn: Record<string, unknown>, chiave: string): { valore: number; dubbio: boolean } | null {
  const v = bn[chiave];
  if (typeof v === "number") return { valore: v, dubbio: false };
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number")) {
    const nums = v as number[];
    return { valore: nums[0], dubbio: new Set(nums).size > 1 };
  }
  return null;
}

const CAMPI_BONUS: { chiave: string; campo: keyof Regole; nome: string }[] = [
  { chiave: "bmpsc", campo: "rigoreSegnato", nome: "rigore segnato" },
  { chiave: "bmyc", campo: "ammonizione", nome: "ammonizione" },
  { chiave: "bmrc", campo: "espulsione", nome: "espulsione" },
  { chiave: "bmog", campo: "autorete", nome: "autorete" },
  { chiave: "bmpns", campo: "rigoreSbagliato", nome: "rigore sbagliato" },
  { chiave: "bmpsa", campo: "rigoreParato", nome: "rigore parato" },
  { chiave: "bmgc", campo: "golSubito", nome: "gol subito" },
  { chiave: "bmcsh", campo: "imbattibilita", nome: "imbattibilità del portiere" },
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

/** Traduce le impostazioni di calcolo nelle nostre regole, dicendo cosa è certo e cosa no. */
export function regoleDaLeghe(imp: DatiLeghe["impostazioni"], base: Regole = REGOLE_STANDARD): { regole: Regole; note: Nota[] } {
  const note: Nota[] = [];
  const regole: Regole = structuredClone(base);
  const bn = (imp.calcolo?.bnMls ?? null) as Record<string, unknown> | null;

  if (!bn) {
    note.push({ tipo: "controlla", testo: "Tabella bonus e malus non trovata: restano le regole standard, controllale qui sotto." });
  } else {
    const gol = peso(bn, "bmgs");
    if (gol) {
      regole.gol = { P: gol.valore, D: gol.valore, C: gol.valore, A: gol.valore };
      if (gol.dubbio) note.push({ tipo: "controlla", testo: `Bonus gol con due valori (${JSON.stringify(bn.bmgs)}): usato il primo, controlla se varia per ruolo.` });
    }
    const assist = ["bmass", "bmasf", "bmasg"].map((k) => peso(bn, k)).filter((x): x is { valore: number; dubbio: boolean } => x !== null);
    if (assist.length) {
      const valori = [...new Set(assist.map((a) => a.valore))];
      regole.assist = valori.reduce((s, v) => s + v, 0) / valori.length;
      if (valori.length > 1) {
        note.push({ tipo: "controlla", testo: `La lega distingue i tipi di assist (${valori.join(" / ")}): usata la media, ${regole.assist}.` });
      }
    }
    for (const c of CAMPI_BONUS) {
      const p = peso(bn, c.chiave);
      if (!p) continue;
      (regole[c.campo] as number) = p.valore;
      if (p.dubbio) note.push({ tipo: "controlla", testo: `Il ${c.nome} ha due valori (${JSON.stringify(bn[c.chiave])}): usato il primo.` });
    }
    const decisivo = peso(bn, "bmdg");
    if (decisivo && decisivo.valore !== 0) {
      note.push({ tipo: "controlla", testo: `La lega dà ${decisivo.valore} per il gol decisivo: non lo prevediamo (i dati storici non lo registrano).` });
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

  const modificatori = campiModificatori(imp.calcolo);
  if (modificatori.length) {
    note.push({
      tipo: "controlla",
      testo: `La lega ha impostazioni di modificatori (${modificatori.join(", ")}) che non sappiamo ancora leggere: attiva e regola il modificatore difesa qui sotto.`,
    });
  }
  return { regole, note };
}

/** Campi dei modificatori non vuoti nelle impostazioni di calcolo. */
export function campiModificatori(calcolo: Record<string, unknown> | null): string[] {
  if (!calcolo) return [];
  return Object.entries(calcolo)
    .filter(([k, v]) => (k.startsWith("smod") || k === "stbdf") && v !== null && v !== false && v !== 0 && v !== "")
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
