import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateLocalTaxAmount,
  calculateLocalTaxes,
  createFlatLocalTaxRules,
  normalizeLocalTaxRule
} from '../js/calculators/local-tax-calculator.js';

test('tratta l’aliquota manuale come una regola piatta', () => {
  const rules = createFlatLocalTaxRules(0.023);

  assert.equal(calculateLocalTaxes(20000, rules), 460);
  assert.equal(calculateLocalTaxes(10000, rules), 230);
});

test('applica esenzione e aliquota comunale sul reddito ricalcolato', () => {
  const milano = normalizeLocalTaxRule({ rate: 0.8, exemption: 23000 });

  assert.equal(calculateLocalTaxAmount(27000, milano), 216);
  assert.equal(calculateLocalTaxAmount(23000, milano), 0);
  assert.equal(calculateLocalTaxAmount(22000, milano), 0);
});

test('applica gli scaglioni progressivi senza trasformarli in aliquota media', () => {
  const rule = normalizeLocalTaxRule({
    brackets: [
      { upTo: 15000, rate: 1 },
      { upTo: 28000, rate: 2 },
      { upTo: Infinity, rate: 3 }
    ]
  });

  assert.equal(calculateLocalTaxAmount(30000, rule), 470);
  assert.equal(calculateLocalTaxAmount(20000, rule), 250);
});
