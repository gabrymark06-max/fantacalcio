import accuratezzaJson from "../data/accuratezza.json";
import fotoJson from "../data/foto.json";
// Solo sul proprio PC (escluso da git, vedi scripts/foto-personali.mjs): altrove è vuoto
import fotoPersonaliJson from "../data/foto-personali.json";
import giocatoriJson from "../data/giocatori.json";
import giornataJson from "../data/giornata.json";
import type { Foto } from "./foto.ts";
import type { Accuratezza, Giocatore, Giornata } from "./types.ts";

export const giocatori = giocatoriJson as Giocatore[];
export const giornata = giornataJson as Giornata;
export const accuratezza = accuratezzaJson as Accuratezza;
/** Le foto libere di Commons hanno la precedenza; Transfermarkt copre chi non ne ha. */
export const foto = { ...(fotoPersonaliJson as Record<string, Foto>), ...(fotoJson as Record<string, Foto>) };
