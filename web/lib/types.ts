export type Ruolo = "P" | "D" | "C" | "A";

export const RUOLI: Ruolo[] = ["P", "D", "C", "A"];

export const NOMI_RUOLO: Record<Ruolo, string> = {
  P: "Portieri",
  D: "Difensori",
  C: "Centrocampisti",
  A: "Attaccanti",
};

/** Voci attese del fantavoto se il giocatore gioca (fantacalcio.it, regole standard in fv_std). */
export interface Componenti {
  fv_std: number;
  voto: number;
  gol: number;
  rigori_segnati: number;
  rigori_sbagliati: number;
  assist: number;
  ammonito: number;
  espulso: number;
  autoreti: number;
  gol_subiti: number;
  rigori_parati: number;
  p_imbattuto: number;
  /** Probabilità di essere il player of the match (bonus di alcune leghe). */
  potm: number;
}

/** Una riga di web/data/giocatori.json (generato da fanta_ai.predict). */
export interface Giocatore {
  id: number;
  nome: string;
  ruolo: Ruolo;
  squadra: string;
  avversario: string;
  casa: boolean;
  qa: number | null;
  fvm: number | null;
  p_gioca: number;
  p_titolare_sos: number | null;
  /** Fantavoto atteso se gioca, regole standard, prossima giornata. */
  fv_atteso: number;
  p_bonus: number;
  punteggio: number;
  p_gioca_stagione: number | null;
  fantamedia: number | null;
  media_voto: number | null;
  presenze: number;
  /** Voci del fantavoto per la prossima partita. */
  giornata: Componenti;
  /** Voci del fantavoto contro l'avversario medio: valore da qui a fine stagione. */
  stagione: Componenti;
  /** Voci del fantavoto in media sulle prossime giornate, contro gli avversari veri (per gli scambi). */
  prossime?: Componenti | null;
}

/** Una partita giocata di recente da una squadra (dalla più recente). */
export interface Forma {
  esito: "V" | "N" | "P";
  fatti: number;
  subiti: number;
  avversario: string;
  casa: boolean;
  data: string;
}

export interface Partita {
  casa: string;
  trasferta: string;
  data: string;
  ora: string;
  p1: number;
  px: number;
  p2: number;
  xg_casa: number;
  xg_trasferta: number;
  fonte_contesto: "quote" | "stima";
  forma_casa?: Forma[];
  forma_trasferta?: Forma[];
}

export interface Giornata {
  stagione: string;
  giornata: number;
  aggiornato: string;
  giocatori_con_titolarita: number;
  nomi_titolarita_non_collegati: number;
  /** Deviazione standard del voto puro attorno al previsto, per ruolo (per il modificatore difesa). */
  sd_voto: Record<Ruolo, number>;
  partite: Partita[];
}

export interface StagioneBacktest {
  stagione: string;
  fv_mae_modello: number;
  fv_mae_baseline: number;
  fv_spearman_modello: number;
  fv_spearman_baseline: number;
  gioca_brier_modello: number;
  gioca_brier_baseline: number;
  rose_simulate: number;
  punti_giornata_modello: number;
  punti_giornata_baseline: number;
  punti_giornata_differenza: number;
}

export interface SettimanaValutata {
  stagione: string;
  giornata: number;
  giocatori_con_voto: number;
  mae_modello: number;
  mae_fantamedia: number;
  top10_fv_medio: number;
  top10_hanno_giocato: number;
  fv_medio_tutti: number;
  sicuri: number;
  sicuri_hanno_giocato: number | null;
}

export interface Accuratezza {
  backtest: StagioneBacktest[];
  settimane: SettimanaValutata[];
}
