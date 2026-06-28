import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInputWarnings } from '../js/utils/input-helpers.js';

test('genera warning per input potenzialmente fuorvianti', () => {
  const warnings = buildInputWarnings({
    reddito: 30000,
    investimento: 20000,
    quotaDatoreFpPerc: 0.015,
    quotaMinAderentePerc: 0.01,
    rendimentoAnnualeFpPerc: 0.02,
    rendimentoAnnualePacPerc: 0.09,
    addizionaliPerc: 0.05,
    ulterioriDetrazioni: 4000
  });

  assert.equal(warnings.length, 4);
  assert.match(warnings[0], /Investimento annuo molto alto/);
  assert.match(warnings[1], /rendimento netto ipotizzato molto più alto/);
  assert.match(warnings[2], /Addizionali sopra il 4%/);
  assert.match(warnings[3], /Ulteriori detrazioni elevate/);
});

test('segnala rendimento PAC inferiore al rendimento FP', () => {
  const warnings = buildInputWarnings({
    reddito: 30000,
    investimento: 3000,
    quotaDatoreFpPerc: 0.015,
    quotaMinAderentePerc: 0.01,
    rendimentoAnnualeFpPerc: 0.05,
    rendimentoAnnualePacPerc: 0.04,
    addizionaliPerc: 0.02,
    ulterioriDetrazioni: 0
  });

  assert.deepEqual(warnings, [
    'Il rendimento netto PAC è più basso del rendimento netto FP: verifica l’ipotesi, perché in questo scenario il PAC non ha un vantaggio di rendimento atteso.'
  ]);
});

test('segnala minimo retributivo superiore alla RAL senza bloccare il valore', () => {
  const warnings = buildInputWarnings({
    reddito: 30000,
    investimento: 3000,
    quotaDatoreFpPerc: 0.015,
    quotaMinAderentePerc: 0.01,
    baseContributivaFpTipo: 'minimoRetributivo',
    baseContributivaFp: 35000,
    rendimentoAnnualeFpPerc: 0.04,
    rendimentoAnnualePacPerc: 0.058,
    addizionaliPerc: 0.02,
    ulterioriDetrazioni: 0
  });

  assert.ok(warnings.includes('Minimo retributivo annuo superiore alla RAL: è insolito, verifica che il valore sia corretto.'));
});

test('segnala rendimento netto PAC inferiore al netto FP calcolato', () => {
  const warnings = buildInputWarnings({
    reddito: 30000,
    investimento: 3000,
    quotaDatoreFpPerc: 0.015,
    quotaMinAderentePerc: 0.01,
    rendimentoAnnualeFpPerc: 0.04,
    rendimentoAnnualePacPerc: 0.08,
    rendimentoNettoFpEffettivo: 0.05,
    rendimentoNettoPacEffettivo: 0.045,
    addizionaliPerc: 0.02,
    ulterioriDetrazioni: 0
  });

  assert.deepEqual(warnings, [
    'Il rendimento netto PAC è più basso del rendimento netto FP: verifica l’ipotesi, perché in questo scenario il PAC non ha un vantaggio di rendimento atteso.'
  ]);
});

test('segnala quota minima datore non raggiunta', () => {
  const warnings = buildInputWarnings({
    reddito: 30000,
    investimento: 100,
    quotaDatoreFpPerc: 0.015,
    quotaMinAderentePerc: 0.01,
    rendimentoAnnualeFpPerc: 0.04,
    rendimentoAnnualePacPerc: 0.08,
    addizionaliPerc: 0.02,
    ulterioriDetrazioni: 0
  });

  assert.deepEqual(warnings, [
    'Con questi input non raggiungi la quota minima per ottenere il contributo del datore.'
  ]);
});
