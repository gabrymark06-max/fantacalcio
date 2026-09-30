import assert from "node:assert/strict";
import { test } from "node:test";

import { daSapere, pGol, pronostico, riassuntoForma } from "./pronostico.ts";
import type { Giocatore, Partita } from "./types.ts";

const partita = (xgC: number, xgT: number, p1: number, px: number, p2: number): Partita => ({
  casa: "Inter", trasferta: "Parma", data: "2026-10-10", ora: "18:00", p1, px, p2, xg_casa: xgC, xg_trasferta: xgT, fonte_contesto: "stima",
  forma_casa: [
    { esito: "V", fatti: 3, subiti: 1, avversario: "Roma", casa: true, data: "2026-09-27" },
    { esito: "N", fatti: 1, subiti: 1, avversario: "Milan", casa: false, data: "2026-09-20" },
  ],
});

test("pronostico: probabilità coerenti con i gol attesi", () => {
  const pr = pronostico(partita(1.5, 0.9, 0.5, 0.25, 0.25));
  assert.ok(Math.abs(pr.golAttesi - 2.4) < 1e-9);
  // porta inviolata = P(0 gol subiti) = e^-λ dell'avversario
  assert.ok(Math.abs(pr.portaInviolataCasa - Math.exp(-0.9)) < 1e-9);
  assert.ok(Math.abs(pr.portaInviolataTrasferta - Math.exp(-1.5)) < 1e-9);
  assert.ok(pr.over15 > pr.over25 && pr.over25 > pr.over35);
  // con 2,4 gol attesi l'over 2,5 è poco sotto la metà
  assert.ok(pr.over25 > 0.4 && pr.over25 < 0.5);
  assert.equal(pr.risultati.length, 4);
  assert.deepEqual([pr.risultati[0].casa, pr.risultati[0].trasferta], [1, 0]);
});

test("da sapere: favorita, gol, risultato, forma", () => {
  const p = partita(2.9, 0.6, 0.85, 0.11, 0.04);
  p.forma_trasferta = [
    { esito: "P", fatti: 0, subiti: 2, avversario: "Roma", casa: true, data: "2026-09-27" },
    { esito: "N", fatti: 1, subiti: 1, avversario: "Milan", casa: false, data: "2026-09-20" },
    { esito: "P", fatti: 0, subiti: 3, avversario: "Lazio", casa: true, data: "2026-09-13" },
  ];
  const schede = daSapere(p, pronostico(p), null, null);
  const di = (tipo: string) => schede.find((x) => x.tipo === tipo)!;
  assert.deepEqual([di("esito").valore, di("esito").titolo], ["85%", "Inter favorita"]);
  assert.equal(di("gol").titolo, "gol attesi: partita da gol");
  assert.equal(di("risultato").valore, "2-0");
  assert.deepEqual([di("forma").titolo, di("forma").valore], ["Parma senza vittorie", "PNP"]);
  assert.deepEqual(riassuntoForma(p.forma_casa!), { vinte: 1, pari: 1, perse: 0, fatti: 4, subiti: 2 });
});

test("probabilità di gol di un giocatore: gioca × almeno un gol", () => {
  const g = { p_gioca: 0.8, giornata: { gol: 0.5, rigori_segnati: 0.1 } } as unknown as Giocatore;
  assert.ok(Math.abs(pGol(g) - 0.8 * (1 - Math.exp(-0.6))) < 1e-9);
});
