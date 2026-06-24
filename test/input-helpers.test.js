import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInputWarnings,
  getScenarioSelection,
  resolveRendimentoFp,
  resolveRendimentoPac
} from '../js/utils/input-helpers.js';

test('risolve gli scenari rendimento predefiniti', () => {
  assert.deepEqual(getScenarioSelection('prudente'), {
    compartoFp: 'garantito',
    etfPreset: 'lifeStrategy40'
  });
  assert.deepEqual(getScenarioSelection('centrale'), {
    compartoFp: 'dinamico',
    etfPreset: 'msciWorld'
  });
  assert.deepEqual(getScenarioSelection('aggressivo'), {
    compartoFp: 'custom',
    etfPreset: 'custom',
    rendimentoFp: 5,
    rendimentoPac: 10
  });
  assert.equal(getScenarioSelection('custom'), null);
});

test('risolve i rendimenti dei preset FP e PAC', () => {
  assert.equal(resolveRendimentoFp('garantito'), 2);
  assert.equal(resolveRendimentoFp('dinamico'), 4);
  assert.equal(resolveRendimentoFp('non-esiste', 1.5), 1.5);

  assert.equal(resolveRendimentoPac('lifeStrategy40'), 4);
  assert.equal(resolveRendimentoPac('msciWorld'), 8);
  assert.equal(resolveRendimentoPac('non-esiste', 6), 6);
});

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
  assert.match(warnings[1], /rendimento ipotizzato molto più alto/);
  assert.match(warnings[2], /Addizionali sopra il 4%/);
  assert.match(warnings[3], /Ulteriori detrazioni elevate/);
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
