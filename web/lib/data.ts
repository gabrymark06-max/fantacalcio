import accuratezzaJson from "../data/accuratezza.json";
import fotoJson from "../data/foto.json";
// Escluso da git (vedi scripts/file-locali.mjs): se manca è vuoto
import fotoPersonaliJson from "../data/foto-personali.json";
import giocatoriJson from "../data/giocatori.json";
import giornataJson from "../data/giornata.json";
import loghiJson from "../data/loghi.json";
import probabiliJson from "../data/probabili.json";
import type { Foto } from "./foto.ts";
import type { PartitaProbabile } from "./probabili.ts";
import type { Accuratezza, Giocatore, Giornata } from "./types.ts";

export const giocatori = giocatoriJson as Giocatore[];
export const giornata = giornataJson as Giornata;
export const accuratezza = accuratezzaJson as Accuratezza;
/** Sul proprio PC le foto di Transfermarkt hanno la precedenza; Commons copre chi non c'è. */
export const foto = { ...(fotoJson as Record<string, Foto>), ...(fotoPersonaliJson as Record<string, Foto>) };
/** Loghi delle squadre (da SOS Fanta), per nome della squadra. */
export const loghi = loghiJson as Record<string, string>;
/** Probabili formazioni di SOS Fanta: solo sul proprio PC, altrove è vuoto (vedi lib/probabili.ts). */
export const probabili = probabiliJson as Record<string, PartitaProbabile>;
