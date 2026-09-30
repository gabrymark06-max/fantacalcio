// File che restano solo sul proprio PC (esclusi da git): foto di Transfermarkt
// (fanta_ai.scraping.foto_tm) e probabili formazioni di SOS Fanta (fanta_ai.probabili).
// Se mancano (es. sul sito pubblicato) ne crea di vuoti: il sito usa le foto di Commons e
// ricava le formazioni dal modello.
import { existsSync, writeFileSync } from "node:fs";

for (const nome of ["foto-personali.json", "probabili.json"]) {
  const file = new URL(`../data/${nome}`, import.meta.url);
  if (!existsSync(file)) writeFileSync(file, "{}\n");
}
