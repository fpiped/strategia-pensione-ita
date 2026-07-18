import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateAnnualizedIrr } from '../js/calculators/cash-flow-return.js';

test('calcola il TIR annualizzato di un investimento semplice', () => {
  const tir = calculateAnnualizedIrr([
    { time: 0, amount: -100 },
    { time: 1, amount: 110 }
  ]);
  assert.ok(Math.abs(tir - 0.1) < 1e-8);
});

test('gestisce versamenti multipli posticipati', () => {
  const tir = calculateAnnualizedIrr([
    { time: 1, amount: -1000 },
    { time: 2, amount: -1000 },
    { time: 3, amount: 2310 }
  ]);
  assert.ok(Math.abs(tir - 0.1) < 1e-8);
});

test('accetta tempi frazionari per future convenzioni infrannuali', () => {
  const tir = calculateAnnualizedIrr([
    { time: 0.5, amount: -100 },
    { time: 1.5, amount: 110 }
  ]);
  assert.ok(Math.abs(tir - 0.1) < 1e-8);
});

test('non inventa un TIR quando manca un cambio di segno', () => {
  assert.equal(calculateAnnualizedIrr([{ time: 1, amount: -100 }]), null);
});
