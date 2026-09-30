import assert from "node:assert/strict";
import { test } from "node:test";

import { importaRose } from "./league.ts";
import { CONTESTO_STANDARD, migliorFormazione, punteggioAtteso, type Contesto } from "./lineup.ts";
import { almenoK, fantavotoRegole, modificatoreAtteso, REGOLE_STANDARD, type Regole } from "./rules.ts";
import { probabilitaAccetta, suggerisciScambi, valutaScambio } from "./trades.ts";
import type { Componenti, Giocatore, Ruolo } from "./types.ts";

let nextId = 1;
function comp(fv: number, extra: Partial<Componenti> = {}): Componenti {
  return {
    fv_std: fv, voto: 6, gol: 0.1, rigori_segnati: 0, rigori_sbagliati: 0, assist: 0.05, ammonito: 0.15,
    espulso: 0.005, autoreti: 0, gol_subiti: 0, rigori_parati: 0, p_imbattuto: 0, ...extra,
  };
}
function g(ruolo: Ruolo, fv: number, opts: { p?: number; nome?: string; fvm?: number; c?: Partial<Componenti> } = {}): Giocatore {
  const id = nextId++;
  const p = opts.p ?? 1;
  const c = comp(fv, opts.c);
  return {
    id, nome: opts.nome ?? `G${id}`, ruolo, squadra: "X", avversario: "Y", casa: true, qa: 1, fvm: opts.fvm ?? 50,
    p_gioca: p, p_titolare_sos: null, fv_atteso: fv, p_bonus: 0.1, punteggio: punteggioAtteso(p, fv),
    p_gioca_stagione: p, fantamedia: fv, media_voto: 6, presenze: 5, giornata: c, stagione: c,
  };
}
function rosa(valori: Record<Ruolo, number[]>): Giocatore[] {
  return (Object.keys(valori) as Ruolo[]).flatMap((r) => valori[r].map((v) => g(r, v)));
}
const ROSA_PIATTA = () => rosa({ P: [5, 5, 5], D: [6, 6, 6, 6, 6, 6, 6, 6], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [6, 6, 6, 6, 6, 6] });
const ctxCon = (regole: Partial<Regole>): Contesto => ({ ...CONTESTO_STANDARD, regole: { ...REGOLE_STANDARD, ...regole } });

test("con le regole standard il fantavoto è quello previsto", () => {
  const x = g("A", 7.3);
  assert.equal(fantavotoRegole(x, REGOLE_STANDARD, "giornata"), 7.3);
});

test("bonus gol diverso per ruolo e imbattibilità cambiano il fantavoto atteso", () => {
  const dif = g("D", 6, { c: { gol: 0.1 } });
  const regole = { ...REGOLE_STANDARD, gol: { ...REGOLE_STANDARD.gol, D: 4.5 } };
  assert.ok(Math.abs(fantavotoRegole(dif, regole, "giornata") - (6 + 1.5 * 0.1)) < 1e-9);
  const por = g("P", 5, { c: { p_imbattuto: 0.4 } });
  assert.ok(Math.abs(fantavotoRegole(por, { ...REGOLE_STANDARD, imbattibilita: 1 }, "giornata") - 5.4) < 1e-9);
});

test("la formazione sceglie il modulo con più punti attesi, o quello scelto", () => {
  const r = rosa({ P: [5, 5, 5], D: [6, 6, 6, 6, 6, 6, 6, 6], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [9, 9, 9, 6, 6, 6] });
  const f = migliorFormazione(r)!;
  assert.ok(["3-4-3", "4-3-3"].includes(f.modulo));
  assert.equal(f.titolari.length, 11);
  assert.equal(migliorFormazione(r, CONTESTO_STANDARD, "5-4-1")!.modulo, "5-4-1");
});

test("i moduli non ammessi dalla lega non vengono proposti", () => {
  const r = rosa({ P: [5, 5, 5], D: [6, 6, 6, 6, 6, 6, 6, 6], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [9, 9, 9, 6, 6, 6] });
  const f = migliorFormazione(r, ctxCon({ moduli: ["4-4-2", "3-5-2"] }))!;
  assert.ok(["4-4-2", "3-5-2"].includes(f.modulo));
});

test("un giocatore che quasi certamente non gioca scende in panchina", () => {
  const fuoriLista = g("A", 9, { p: 0.03 });
  const f = migliorFormazione([...ROSA_PIATTA(), fuoriLista])!;
  assert.ok(!f.titolari.includes(fuoriLista));
});

test("rosa incompleta: nessuna formazione", () => {
  assert.equal(migliorFormazione(rosa({ P: [5], D: [6, 6], C: [6, 6, 6], A: [6] })), null);
});

test("modificatore difesa: solo con 4 difensori, e più alto con difensori da voto alto", () => {
  const md = { ...REGOLE_STANDARD.modificatoreDifesa, attivo: true };
  const regole = { ...REGOLE_STANDARD, modificatoreDifesa: md };
  const sd = { P: 0.55, D: 0.57, C: 0.56, A: 0.68 };
  const por = g("P", 5, { c: { voto: 6.3 } });
  const buoni = [0, 1, 2, 3].map(() => g("D", 6.3, { c: { voto: 6.5 } }));
  const scarsi = [0, 1, 2, 3].map(() => g("D", 5.8, { c: { voto: 5.8 } }));
  const conBuoni = modificatoreAtteso([por, ...buoni], [], regole, "giornata", sd);
  const conScarsi = modificatoreAtteso([por, ...scarsi], [], regole, "giornata", sd);
  assert.ok(conBuoni > conScarsi && conScarsi >= 0);
  assert.ok(conBuoni > 1 && conBuoni < 6);
  assert.equal(modificatoreAtteso([por, ...buoni.slice(0, 3)], [], regole, "giornata", sd), 0);
});

test("col modificatore attivo la difesa a 4 diventa più conveniente", () => {
  const r = rosa({ P: [5, 5, 5], D: [6, 6, 6, 6, 6, 6, 6, 6], C: [6.2, 6.2, 6.2, 6.2, 6.2, 6.2, 6, 6], A: [6.2, 6.2, 6.2, 6, 6, 6] });
  r.filter((x) => x.ruolo !== "A" && x.ruolo !== "C").forEach((x) => (x.giornata.voto = 6.6));
  const senza = migliorFormazione(r)!;
  const con = migliorFormazione(r, ctxCon({ modificatoreDifesa: { ...REGOLE_STANDARD.modificatoreDifesa, attivo: true } }))!;
  assert.equal(senza.modificatore, 0);
  assert.ok(con.modificatore > 0);
  assert.ok(Number(con.modulo[0]) >= 4);
});

test("almenoK: probabilità di almeno k successi", () => {
  assert.ok(Math.abs(almenoK([0.5, 0.5], 1) - 0.75) < 1e-12);
  assert.equal(almenoK([1, 1, 1], 3), 1);
});

test("probabilità di accettare: equità e miglioramento della loro rosa", () => {
  assert.ok(Math.abs(probabilitaAccetta(1, 0) - 0.5) < 1e-12);
  assert.ok(probabilitaAccetta(1.1, 0) > 0.6);
  assert.ok(probabilitaAccetta(0.9, 0) < 0.4);
  assert.ok(probabilitaAccetta(1, 0.3) > probabilitaAccetta(1, 0));
});

test("uno scambio che conviene a me ma regala valore di mercato non viene proposto", () => {
  // loro hanno un campione (FVM alto) in panchina: per il modello mi serve, ma chiederlo in cambio
  // di un giocatore da FVM basso sarebbe una proposta improponibile
  const mia = ROSA_PIATTA();
  const loro = ROSA_PIATTA();
  const campione = g("A", 8.5, { fvm: 300 });
  loro.splice(loro.findIndex((x) => x.ruolo === "A"), 1, campione);
  const scambi = suggerisciScambi(mia, [{ nome: "Loro", rosa: loro }], CONTESTO_STANDARD);
  assert.ok(!scambi.some((s) => s.ricevo.includes(campione) && s.fvmRicevono < 200));
});

test("scambio proposto: guadagno per me, equità di mercato, ruoli invariati, giocatori diversi", () => {
  // io: difesa profonda, attacco debole; loro: il contrario, con valori di mercato simili
  const mia = rosa({ P: [5, 5, 5], D: [7, 7, 7, 7, 7, 6, 6, 6], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [6, 6, 6, 5.8, 5.8, 5.8] });
  const loro = rosa({ P: [5, 5, 5], D: [6, 6, 6, 5.8, 5.8, 5.8, 5.8, 5.8], C: [6, 6, 6, 6, 6, 6, 6, 6], A: [7.5, 7.5, 7.5, 7.5, 7.5, 6] });
  const scambi = suggerisciScambi(mia, [{ nome: "Loro", rosa: loro }], CONTESTO_STANDARD);
  assert.ok(scambi.length > 0);
  for (const s of scambi) {
    assert.ok(s.deltaMio >= 0.15 && s.pAccetta >= 0.45);
    assert.deepEqual(s.cedo.map((x) => x.ruolo).sort(), s.ricevo.map((x) => x.ruolo).sort());
  }
  const ids = scambi.flatMap((s) => [...s.cedo, ...s.ricevo].map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("valutare uno scambio a vuoto non cambia niente", () => {
  const mia = ROSA_PIATTA();
  const s = valutaScambio(mia, mia, [], [], "Io", CONTESTO_STANDARD);
  assert.equal(s.deltaMio, 0);
});

test("import rose: id Leghe Fantacalcio e nomi, con separatori e non trovati", () => {
  const giocatori = [g("A", 7, { nome: "Martinez L." }), g("C", 6, { nome: "Barella" }), g("D", 6, { nome: "Dimarco" })];
  const [lautaro, barella, dimarco] = giocatori;
  const testo = [`Squadra A,${lautaro.id},40`, `Squadra A,${barella.id},20`, "$,$,$", "Squadra B;Dimarco", "Squadra B;Sconosciuto"].join("\n");
  const esito = importaRose(testo, giocatori);
  assert.deepEqual(esito.squadre, [
    { nome: "Squadra A", ids: [lautaro.id, barella.id] },
    { nome: "Squadra B", ids: [dimarco.id] },
  ]);
  assert.deepEqual(esito.nonTrovati, [{ squadra: "Squadra B", valore: "Sconosciuto" }]);
});
