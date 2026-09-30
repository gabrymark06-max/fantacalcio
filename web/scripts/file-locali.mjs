// File esclusi da git: foto di Transfermarkt (fanta_ai.scraping.foto_tm), loghi e probabili
// formazioni di SOS Fanta (fanta_ai.probabili): non su GitHub, sì su Vercel. Se un file manca
// ne crea uno vuoto: il sito usa le foto di Commons, le sigle al posto dei loghi e ricava le
// formazioni dal modello.
import { existsSync, writeFileSync } from "node:fs";

for (const nome of ["foto-personali.json", "probabili.json", "loghi.json"]) {
  const file = new URL(`../data/${nome}`, import.meta.url);
  if (!existsSync(file)) writeFileSync(file, "{}\n");
}
