/** web/data/pronostici.json, generato da fanta_ai.pronostici. */

export interface RigaClassifica {
  pos: number;
  squadra: string;
  g: number;
  v: number;
  n: number;
  p: number;
  gf: number;
  gs: number;
  pt: number;
  pt_casa: number;
  g_casa: number;
  pt_trasferta: number;
  g_trasferta: number;
}

export interface RigaProiezione {
  squadra: string;
  punti: number;
  punti_attesi: number;
  pos_media: number;
  p_scudetto: number;
  p_champions: number;
  p_europa: number;
  p_conference: number;
  p_retrocessione: number;
  attacco: number;
  difesa: number;
}

export interface StatisticheLato {
  partite: number;
  fatti?: number | null;
  subiti?: number | null;
  tiri?: number | null;
  tiri_porta?: number | null;
  corner?: number | null;
  falli?: number | null;
  gialli?: number | null;
  rossi?: number | null;
  tiri_subiti?: number | null;
  corner_subiti?: number | null;
  porta_inviolata?: number;
  segna?: number;
  over25?: number;
  gg?: number;
}

export interface StatisticheSquadra {
  totale: StatisticheLato;
  casa: StatisticheLato;
  trasferta: StatisticheLato;
}

export interface PartitaForma {
  data: string;
  avversario: string;
  casa: boolean;
  fatti: number;
  subiti: number;
  esito: "V" | "N" | "P";
}

export interface Precedente {
  data: string;
  casa: string;
  trasferta: string;
  gol_casa: number;
  gol_trasferta: number;
}

/** Quote di un bookmaker (o della media di mercato) per i mercati disponibili. */
export interface QuoteLibro {
  nome: string;
  [mercato: string]: string | number | null | undefined;
}

export interface DatiPartita {
  statistiche: { casa: StatisticheSquadra; trasferta: StatisticheSquadra };
  forma: { casa: PartitaForma[]; trasferta: PartitaForma[] };
  precedenti: Precedente[];
  posizione: { casa: number | null; trasferta: number | null };
  quote: { fonte: string; libri: QuoteLibro[] } | null;
}

export interface DatiPronostici {
  aggiornato: string;
  giornata: number;
  classifica: RigaClassifica[];
  proiezione: RigaProiezione[];
  simulazioni: number;
  partite: Record<string, DatiPartita>;
}
