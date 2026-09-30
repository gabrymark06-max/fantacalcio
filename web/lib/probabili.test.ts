import assert from "node:assert/strict";
import { test } from "node:test";

import { formazioneSquadra, righeModulo, sigla, type LatoProbabile } from "./probabili.ts";
import type { Giocatore, Ruolo } from "./types.ts";

let prossimo = 1;
function g(ruolo: Ruolo, p: number, squadra = "Como"): Giocatore {
  const c = { fv_std: 6, voto: 6, gol: 0, rigori_segnati: 0, rigori_sbagliati: 0, assist: 0, ammonito: 0, espulso: 0, autoreti: 0, gol_subiti: 0, rigori_parati: 0, p_imbattuto: 0, potm: 0 };
  const id = prossimo++;
  return {
    id, nome: `G${id}`, ruolo, squadra, avversario: "Roma", casa: true, qa: 1, fvm: 1, p_gioca: p, p_titolare_sos: null,
    fv_atteso: 6, p_bonus: 0, punteggio: 6, p_gioca_stagione: p, fantamedia: 6, media_voto: 6, presenze: 1, giornata: c, stagione: c,
  };
}

function rosa(): Giocatore[] {
  return [
    g("P", 0.95), g("P", 0.05),
    g("D", 0.9), g("D", 0.9), g("D", 0.9), g("D", 0.9), g("D", 0.2),
    g("C", 0.9), g("C", 0.9), g("C", 0.9), g("C", 0.9), g("C", 0.9), g("C", 0.1),
    g("A", 0.9), g("A", 0.3), g("A", 0.1),
  ];
}

test("righe del modulo dal portiere all'attacco", () => {
  assert.deepEqual(righeModulo("4-2-3-1"), [1, 4, 2, 3, 1]);
  assert.deepEqual(righeModulo("3-5-2"), [1, 3, 5, 2]);
  assert.equal(righeModulo("4-4-3"), null);
  assert.equal(righeModulo(null), null);
});

test("senza probabili di SOS la formazione si ricava dal modello", () => {
  const r = rosa();
  const f = formazioneSquadra("Como", r, new Map(r.map((x) => [x.id, x])))!;
  assert.equal(f.fonte, "modello");
  assert.equal(f.modulo, "4-5-1");
  assert.equal(f.titolari.length, 11);
  assert.ok(f.titolari.every((x) => x.p_gioca >= 0.9));
  assert.ok(!f.panchina.some((x) => f.titolari.includes(x)));
});

test("con le probabili di SOS: il loro modulo e il loro ordine, panchina senza indisponibili", () => {
  const r = rosa();
  const perId = new Map(r.map((x) => [x.id, x]));
  const ordine = [r[0], r[2], r[3], r[4], r[5], r[7], r[8], r[9], r[10], r[11], r[13]];
  const lato: LatoProbabile = {
    titolari: ordine.map((x) => ({ id: x.id, nome: x.nome, pct: 95 })),
    panchina: [],
    ballottaggi: [{ a: { id: r[13].id, nome: r[13].nome }, pa: 60, b: { id: r[14].id, nome: r[14].nome }, pb: 40 }],
    indisponibili: [{ id: r[6].id, nome: r[6].nome, stato: "Infortunato", nota: "in dubbio" }, { id: null, nome: "Sconosciuto", stato: null, nota: null }],
  };
  const f = formazioneSquadra("Como", r, perId, lato, "4-2-3-1")!;
  assert.equal(f.fonte, "sos");
  assert.deepEqual(f.linee.map((l) => l.length), [1, 4, 2, 3, 1]);
  assert.equal(f.linee[4][0], r[13]);
  assert.ok(!f.panchina.includes(r[6]));
  assert.equal(f.ballottaggi[0].b, r[14]);
  assert.equal(f.indisponibili[1].g.nome, "Sconosciuto");
  // un titolare non collegato al listone: si torna alla formazione del modello
  const rotto = { ...lato, titolari: lato.titolari.map((t, i) => (i === 3 ? { ...t, id: null } : t)) };
  assert.equal(formazioneSquadra("Como", r, perId, rotto, "4-2-3-1")!.fonte, "modello");
});

test("sigle delle squadre", () => {
  assert.equal(sigla("Juventus"), "JUV");
});
