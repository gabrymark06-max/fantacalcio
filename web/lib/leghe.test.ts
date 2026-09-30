import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { codiceSegnalibro, sorgenteSegnalibro } from "./bookmarklet.ts";
import { campiModificatori, codificaImport, decodificaImport, fasceDaSmodd, moduliDaLeghe, regoleDaLeghe, roseDaLeghe, ruoliDaLeghe, type DatiLeghe } from "./leghe.ts";
import { REGOLE_STANDARD } from "./rules.ts";
import type { Giocatore } from "./types.ts";

const calcoloEsempio = {
  // stessa forma letta da fantabot: ogni valore è una coppia
  bnMls: {
    bmgs: [3, 3], bmass: [1, 1], bmasf: [1, 1], bmasg: [1, 1], bmyc: [-0.5, -0.5], bmrc: [-1, -1],
    bmog: [-2, -2], bmpsc: [3, 3], bmpns: [-3, -3], bmpsa: [3, 3], bmgc: [-1, -1], bmcsh: [1, 1],
    motm: [1, 1], bmdg: [0, 0],
  },
  step: { stlmt: 66, stgoal: [6] },
  smoddf: null,
  stbdf: null,
};

function dati(extra: Partial<DatiLeghe> = {}): DatiLeghe {
  return {
    v: 1,
    lega: { nome: "Berluscahouse" },
    utente: 42,
    squadre: [
      { nome: "JOGA BENITO", proprietario: 42, ids: [1, 2, 999], costi: [10, 5, 1] },
      { nome: "INGIOCABILI", proprietario: 7, ids: [3], costi: [20] },
    ],
    impostazioni: { calcolo: calcoloEsempio, formazione: { mods: ["343", "352", "433"] }, ruoli: [{ id: 2, role: 4, originalRole: 3 }] },
    ...extra,
  };
}

test("i dati viaggiano nel frammento dell'URL e tornano identici, accenti compresi", () => {
  const d = dati({ lega: { nome: "Lega dei più forti è qui" } });
  const tornati = decodificaImport(`#importa=${codificaImport(d)}`);
  assert.deepEqual(tornati, d);
  assert.equal(decodificaImport("#altro=1"), null);
  assert.equal(decodificaImport("#importa=@@@"), null);
});

test("bonus e malus di Leghe Fantacalcio diventano le nostre regole", () => {
  const { regole, note } = regoleDaLeghe(dati().impostazioni);
  assert.equal(regole.imbattibilita, 1);
  assert.equal(regole.playerOfTheMatch, 1);
  assert.equal(regole.gol.D, 3);
  assert.equal(regole.ammonizione, -0.5);
  assert.deepEqual(regole.moduli, ["3-4-3", "3-5-2", "4-3-3"]);
  assert.ok(note.some((n) => n.tipo === "ok"));
});

test("quello che non è certo viene segnalato, non indovinato", () => {
  const calcolo = { ...calcoloEsempio, bnMls: { ...calcoloEsempio.bnMls, bmgs: [3, 4.5], bmasf: [0.5, 0.5], bmdg: [1, 1] }, smoddf: { x: 1 } };
  const { regole, note } = regoleDaLeghe({ calcolo, formazione: null, ruoli: null });
  const testi = note.filter((n) => n.tipo !== "ok").map((n) => n.testo).join(" | ");
  assert.match(testi, /Bonus gol in un formato che non conosciamo/);
  assert.match(testi, /valori diversi agli assist/);
  assert.match(testi, /gol decisivo/);
  assert.match(testi, /Non ancora calcolati: smoddf/);
  assert.match(testi, /Moduli ammessi non riconosciuti/);
  assert.deepEqual(regole.moduli, REGOLE_STANDARD.moduli);
  assert.equal(regole.assist, 0.75);
});

test("senza impostazioni restano le regole standard", () => {
  const { regole } = regoleDaLeghe({ calcolo: null, formazione: null, ruoli: null });
  assert.deepEqual(regole, REGOLE_STANDARD);
});

test("moduli, modificatori e ruoli nei formati possibili", () => {
  assert.deepEqual(moduliDaLeghe({ mods: [{ m: "4-4-2" }, 541, "999"] }), ["4-4-2", "5-4-1"]);
  assert.equal(moduliDaLeghe({}), null);
  assert.deepEqual(campiModificatori({ smoddf: null, smodcc: { a: 1 }, stbdf: 0, skodm: null }), ["smodcc"]);
  assert.deepEqual(ruoliDaLeghe([{ id: 632, role: 4 }, { id: 5, role: 9 }]), { 632: "A" });
  assert.deepEqual(ruoliDaLeghe({ data: [{ id: 1, role: 1 }] }), { 1: "P" });
});

test("rose: tengo solo i giocatori del listone e riconosco la mia squadra", () => {
  const listone = [1, 2, 3].map((id) => ({ id }) as Giocatore);
  const rose = roseDaLeghe(dati(), listone);
  assert.deepEqual(rose.squadre, [
    { nome: "JOGA BENITO", ids: [1, 2] },
    { nome: "INGIOCABILI", ids: [3] },
  ]);
  assert.equal(rose.mia, "JOGA BENITO");
  assert.equal(rose.fuoriListone, 1);
});

test("il segnalibro è JavaScript valido e punta al sito giusto", () => {
  const codice = codiceSegnalibro("https://esempio.it");
  assert.ok(codice.startsWith("javascript:"));
  const js = decodeURIComponent(codice.slice("javascript:".length));
  assert.ok(js.includes('"https://esempio.it"'));
  assert.doesNotThrow(() => new Function(js));
  assert.doesNotThrow(() => new Function(sorgenteSegnalibro("http://localhost:3000")));
});

test("impostazioni reali di una lega Classic: valori per ruolo, modificatore difesa a fasce di 0,25", () => {
  const imp = JSON.parse(readFileSync(new URL("./fixtures/impostazioni-classic-reale.json", import.meta.url), "utf8"));
  const { regole, note } = regoleDaLeghe({ ...imp, ruoli: null });
  // bmgs [5, 3, 3, 3]: il gol vale +5 solo al portiere
  assert.deepEqual(regole.gol, { P: 5, D: 3, C: 3, A: 3 });
  assert.equal(regole.assist, 1);
  assert.equal(regole.golSubito, -1);
  assert.equal(regole.imbattibilita, 1);
  assert.equal(regole.playerOfTheMatch, 0);
  assert.equal(regole.ammonizione, -0.5);
  assert.deepEqual(regole.moduli, ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"]);
  assert.equal(regole.modificatoreDifesa.attivo, true);
  assert.deepEqual(regole.modificatoreDifesa.fasce, [
    { da: 6, bonus: 0.5 },
    { da: 6.25, bonus: 1 },
    { da: 6.5, bonus: 1.5 },
    { da: 6.75, bonus: 2 },
    { da: 7, bonus: 3 },
  ]);
  const testi = note.map((n) => n.testo).join(" | ");
  assert.match(testi, /Bonus gol per ruolo: P \+5, D \+3, C \+3, A \+3/);
  assert.match(testi, /gol decisivo \+1, gol del pareggio \+0,5/);
  assert.match(testi, /Modificatore capitano attivo: sotto 5,7 -0,5, da 5,7 0, da 6,3 \+0,5 secondo il voto del capitano/);
  assert.deepEqual(regole.capitano, {
    attivo: true,
    fasce: [
      { da: 0, bonus: -0.5 },
      { da: 5.7, bonus: 0 },
      { da: 6.3, bonus: 0.5 },
    ],
  });
  assert.doesNotMatch(testi, /formato che non conosciamo/);
});

test("fasce del modificatore: valore sotto soglia diverso da zero diventa una fascia", () => {
  assert.deepEqual(fasceDaSmodd({ smodld: 6, smodlu: 7, smodva: [-1, 1, 3] }), [
    { da: 0, bonus: -1 },
    { da: 6, bonus: 1 },
    { da: 7, bonus: 3 },
  ]);
  assert.equal(fasceDaSmodd({ smodld: 7, smodlu: 6, smodva: [0, 1, 2] }), null);
});
