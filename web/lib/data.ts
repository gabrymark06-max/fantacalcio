import accuratezzaJson from "../data/accuratezza.json";
import giocatoriJson from "../data/giocatori.json";
import giornataJson from "../data/giornata.json";
import type { Accuratezza, Giocatore, Giornata } from "./types.ts";

export const giocatori = giocatoriJson as Giocatore[];
export const giornata = giornataJson as Giornata;
export const accuratezza = accuratezzaJson as Accuratezza;
