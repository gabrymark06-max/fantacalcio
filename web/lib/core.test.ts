import assert from "node:assert/strict";
import { test } from "node:test";

import { importaRose } from "./league.ts";
import { migliorFormazione, punteggioAtteso } from "./lineup.ts";
import { suggerisciScambi, valutaScambio } from "./trades.ts";
import type { Giocatore, Ruolo } from "./types.ts";

let nextId = 1;
function g(ruolo: Ruolo, fv: number, p = 1, nome?: string): Giocatore {
  const id = nextId++;
  return {
    id, nome: nome ?? `G${id}`, ruolo, squadra: "X", avversario: "Y", casa: true, qa: 1, fvm: 1,
    p_gioca: p, p_titolare_sos: null, fv_atteso: fv, p_bonus: 0.1, punteggio: punteggioAtteso(p, fv),
    p_gioca_stagione: p, fv_stagione: fv, fantamedia: fv, media_voto: 6, presenze: 5,
  };
}

function rosa(valori: Record<Ruolo, number[]>): Giocatore[] {
  return (Object.keys(valori) as Ruolo[]).flatMap((r) => valori[r].map((v) => g(r, v)));
}

test("la formazione sceglie il modulo con più punti attesi", () => {
  const r = rosa({
    P: [5, 5, 5],
    D: [6, 6, 6, 6, 6, 6, 6, 6],
    C: [6, 6, 6, 6, 6, 6, 6, 6],
    A: [9, 9, 9, 6, 6, 6],
  });
  const f = migliorFormazione(r)!;
  assert.ok(["3-4-3", "4-3-3"].includes(f.modulo));
  assert.equal(f.titolari.length, 11);
  assert.equal(f.titolari.filter((x) => x.ruolo === "A" && x.fv_atteso === 9).length, 3);
});

test("un giocatore che quasi certamente non gioca scende in panchina", () => {
  const r = rosa({ P: [5, 5, 5], D: [6, 6, 6, 6, 6, 6, 6, 6], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [6, 6, 6, 6, 6, 6] });
  const fuoriLista = g("A", 9, 0.03);
  const f = migliorFormazione([...r, fuoriLista])!;
  assert.ok(!f.titolari.includes(fuoriLista));
});

test("rosa incompleta: nessuna formazione", () => {
  assert.equal(migliorFormazione(rosa({ P: [5], D: [6, 6], C: [6, 6, 6], A: [6] })), null);
});

test("scambio 2 contro 2 che conviene a entrambi viene suggerito", () => {
  // io: tanti difensori forti, attacco debole; loro: il contrario
  const mia = rosa({ P: [5, 5, 5], D: [7, 7, 7, 7, 7, 6, 6, 6], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [6, 6, 6, 5.8, 5.8, 5.8] });
  const loro = rosa({ P: [5, 5, 5], D: [6, 6, 6, 5.8, 5.8, 5.8, 5.8, 5.8], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [8, 8, 8, 8, 8, 6] });
  const scambi = suggerisciScambi(mia, [{ nome: "Loro", rosa: loro }]);
  assert.ok(scambi.length > 0);
  const primo = scambi[0];
  assert.ok(primo.deltaMio > 0 && primo.deltaLoro > 0);
  assert.deepEqual(primo.cedo.map((x) => x.ruolo).sort(), primo.ricevo.map((x) => x.ruolo).sort());
});

test("ogni giocatore compare in una sola proposta di scambio", () => {
  const mia = rosa({ P: [5, 5, 5], D: [7, 7, 7, 7, 7, 6, 6, 6], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [6, 6, 6, 5.8, 5.8, 5.8] });
  const loro = rosa({ P: [5, 5, 5], D: [6, 6, 6, 5.8, 5.8, 5.8, 5.8, 5.8], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [8, 8, 8, 8, 8, 6] });
  const ids = suggerisciScambi(mia, [{ nome: "Loro", rosa: loro }]).flatMap((s) => [...s.cedo, ...s.ricevo].map((g) => g.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("valutare uno scambio a vuoto non cambia niente", () => {
  const mia = rosa({ P: [5, 5, 5], D: [6, 6, 6, 6, 6, 6, 6, 6], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [6, 6, 6, 6, 6, 6] });
  const s = valutaScambio(mia, mia, [], [], "Io");
  assert.equal(s.deltaMio, 0);
});

test("import rose: id Leghe Fantacalcio e nomi, con separatori e non trovati", () => {
  const giocatori = [g("A", 7, 1, "Martinez L."), g("C", 6, 1, "Barella"), g("D", 6, 1, "Dimarco")];
  const [lautaro, barella, dimarco] = giocatori;
  const testo = [
    `Squadra A,${lautaro.id},40`,
    `Squadra A,${barella.id},20`,
    "$,$,$",
    "Squadra B;Dimarco",
    "Squadra B;Sconosciuto",
  ].join("\n");
  const esito = importaRose(testo, giocatori);
  assert.deepEqual(esito.squadre, [
    { nome: "Squadra A", ids: [lautaro.id, barella.id] },
    { nome: "Squadra B", ids: [dimarco.id] },
  ]);
  assert.deepEqual(esito.nonTrovati, [{ squadra: "Squadra B", valore: "Sconosciuto" }]);
});
