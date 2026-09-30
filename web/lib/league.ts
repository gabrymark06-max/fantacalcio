import type { Giocatore } from "./types.ts";

export interface Squadra {
  nome: string;
  ids: number[];
}

export interface Lega {
  squadre: Squadra[];
  mia: string | null;
}

export interface EsitoImport {
  squadre: Squadra[];
  nonTrovati: { squadra: string; valore: string }[];
}

function norm(testo: string): string {
  return testo
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Legge le rose di una lega. Formati accettati, una riga per giocatore:
 *   - export Leghe Fantacalcio: `Squadra,id,prezzo` (le righe `$,$,$` separano le squadre);
 *   - `Squadra,Nome giocatore` oppure `Squadra;Nome giocatore`.
 * Il giocatore si trova per id ufficiale se c'è, altrimenti per nome esatto (senza accenti).
 */
export function importaRose(testo: string, giocatori: Giocatore[]): EsitoImport {
  const perId = new Map(giocatori.map((g) => [g.id, g]));
  const perNome = new Map<string, Giocatore[]>();
  for (const g of giocatori) {
    const k = norm(g.nome);
    perNome.set(k, [...(perNome.get(k) ?? []), g]);
  }

  const squadre = new Map<string, number[]>();
  const nonTrovati: EsitoImport["nonTrovati"] = [];
  for (const riga of testo.split(/\r?\n/)) {
    const colonne = riga.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (colonne.length < 2 || !colonne[0] || colonne[0] === "$") continue;
    const [squadra, valore] = colonne;
    if (!valore || /^(id|nome|calciatore|giocatore)$/i.test(valore)) continue;

    let trovato: Giocatore | undefined;
    if (/^\d+$/.test(valore)) {
      trovato = perId.get(Number(valore));
    } else {
      const candidati = perNome.get(norm(valore)) ?? [];
      trovato = candidati.length === 1 ? candidati[0] : undefined;
    }
    if (!trovato) {
      nonTrovati.push({ squadra, valore });
      continue;
    }
    const ids = squadre.get(squadra) ?? [];
    if (!ids.includes(trovato.id)) ids.push(trovato.id);
    squadre.set(squadra, ids);
  }
  return {
    squadre: [...squadre.entries()].map(([nome, ids]) => ({ nome, ids })),
    nonTrovati,
  };
}

export function rosaDi(squadra: Squadra, giocatori: Map<number, Giocatore>): Giocatore[] {
  return squadra.ids.map((id) => giocatori.get(id)).filter((g): g is Giocatore => g !== undefined);
}
