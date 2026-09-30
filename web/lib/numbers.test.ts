import assert from "node:assert/strict";
import { test } from "node:test";

import { leggiNumero } from "./numbers.ts";

test("i numeri si leggono con la virgola o col punto, anche con segno", () => {
  assert.equal(leggiNumero("6,25"), 6.25);
  assert.equal(leggiNumero("6.75"), 6.75);
  assert.equal(leggiNumero("-0,5"), -0.5);
  assert.equal(leggiNumero("+1"), 1);
  assert.equal(leggiNumero(" 7 "), 7);
});

test("mentre si scrive un numero non è ancora valido e non va applicato", () => {
  assert.equal(leggiNumero(""), null);
  assert.equal(leggiNumero("-"), null);
  assert.equal(leggiNumero("6,2,5"), null);
  assert.equal(leggiNumero("abc"), null);
});
