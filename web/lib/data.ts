import accuratezzaJson from "../data/accuratezza.json";
import fotoJson from "../data/foto.json";
import giocatoriJson from "../data/giocatori.json";
import giornataJson from "../data/giornata.json";
import type { Foto } from "./foto.ts";
import type { Accuratezza, Giocatore, Giornata } from "./types.ts";

export const giocatori = giocatoriJson as Giocatore[];
export const giornata = giornataJson as Giornata;
export const accuratezza = accuratezzaJson as Accuratezza;
export const foto = fotoJson as Record<string, Foto>;
