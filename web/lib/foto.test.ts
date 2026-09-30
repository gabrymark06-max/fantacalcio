import assert from "node:assert/strict";
import { test } from "node:test";

import { iniziali, ritaglio, type Foto } from "./foto.ts";

const base: Foto = { url: "", cx: 50, cy: 50, scala: 1, ar: 1, viso: true, autore: "", licenza: "", pagina: "" };
const pct = (s: string) => Number(s.replace("%", ""));

test("foto quadrata grande quanto il cerchio: nessuno spostamento possibile", () => {
  assert.deepEqual(ritaglio(base), { width: "100%", left: "0%", top: "0%" });
});

test("ritratto verticale: viso poco sopra la metà del cerchio", () => {
  // altezza 130%: centro del viso al 40% = 52% dall'alto → 44 - 52 = -8
  assert.equal(pct(ritaglio({ ...base, cy: 40, ar: 1.3 }).top), -8);
});

test("viso piccolo in alto a sinistra: la foto si ingrandisce e il viso va al centro", () => {
  const r = ritaglio({ ...base, cx: 30, cy: 20, scala: 4, ar: 1.5 });
  assert.equal(pct(r.width), 400);
  // centro del viso: 30% di 400% = 120% dal bordo sinistro dell'immagine → 50 - 120 = -70
  assert.equal(pct(r.left), -70);
  // altezza 600%: 20% di 600% = 120% → 44 - 120 = -76
  assert.equal(pct(r.top), -76);
});

test("il ritaglio non lascia mai vuoti ai bordi del cerchio", () => {
  for (const f of [
    { ...base, cx: 2, cy: 2, scala: 3, ar: 1 },
    { ...base, cx: 98, cy: 98, scala: 3, ar: 1 },
    { ...base, cx: 50, cy: 5, scala: 1, ar: 0.5 }, // foto larga: va comunque coperto tutto il cerchio
  ]) {
    const r = ritaglio(f);
    const w = pct(r.width);
    const h = (w * f.ar);
    assert.ok(pct(r.left) <= 0 && pct(r.left) + w >= 100 - 1e-9);
    assert.ok(pct(r.top) <= 0 && pct(r.top) + h >= 100 - 1e-9);
  }
});

test("iniziali per chi non ha una foto", () => {
  assert.equal(iniziali("Martinez L."), "ML");
  assert.equal(iniziali("Dimarco"), "DI");
});
