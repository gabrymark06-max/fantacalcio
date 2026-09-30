// Le foto di Transfermarkt (fanta_ai.scraping.foto_tm) restano solo sul proprio PC: il file è
// escluso da git. Se manca (es. sul sito pubblicato) ne crea uno vuoto e restano solo quelle di Commons.
import { existsSync, writeFileSync } from "node:fs";

const file = new URL("../data/foto-personali.json", import.meta.url);
if (!existsSync(file)) writeFileSync(file, "{}\n");
