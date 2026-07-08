import assert from 'node:assert/strict';
import test from 'node:test';

import { FINANCIAL_CONSTANTS } from '../js/constants/financial-constants.js';
import {
  applyPeriodicVariation,
  calculateEmployerContribution,
  getInitialEmployerContribution,
  resolveContributionBase,
  resolveEmployerContributionBase,
  splitBudget
} from '../js/calculators/pension-contributions.js';

test('applica variazioni periodiche percentuali e fisse', () => {
  assert.equal(Math.round(applyPeriodicVariation(30000, 4, 'percentuale', 3, 10)), 33000);
  assert.equal(applyPeriodicVariation(30000, 5, 'euro', 2, 1000), 32000);
  assert.equal(applyPeriodicVariation(30000, 1, 'percentuale', 1, 10), 30000);
});

test('risolve base contributiva aderente e datore senza forzare la RAL', () => {
  assert.equal(resolveContributionBase({
    redditoAnno: 40000,
    anno: 1,
    baseContributivaFpTipo: 'ral'
  }), 40000);

  assert.equal(resolveContributionBase({
    redditoAnno: 40000,
    anno: 1,
    baseContributivaFpTipo: 'manuale',
    baseContributivaFp: 50000
  }), 50000);

  assert.equal(resolveEmployerContributionBase({
    redditoAnno: 40000,
    anno: 1,
    baseQuotaAnno: 30000,
    baseDatoreFpTipo: 'same'
  }), 30000);
});

test('calcola contributo datore percentuale, fisso e soglia minima aderente', () => {
  assert.equal(calculateEmployerContribution(30000, 0.015, 100), 550);
  assert.equal(getInitialEmployerContribution({
    reddito: 30000,
    investimento: 300,
    quotaDatoreFpPerc: 0.015,
    contributoDatoreFisso: 0,
    quotaMinAderentePerc: 0.01
  }), 450);
  assert.equal(getInitialEmployerContribution({
    reddito: 30000,
    investimento: 299,
    quotaDatoreFpPerc: 0.015,
    contributoDatoreFisso: 0,
    quotaMinAderentePerc: 0.01
  }), 0);
});

test('divide budget tra quota deducibile, PAC extra e contributo datore', () => {
  assert.deepEqual(splitBudget(200, 300, 450), {
    quotaDeducibile: 200,
    quotaExtraPac: 0,
    quotaDatore: 0
  });

  const overLimitAllocation = splitBudget(6000, 300, 450);
  assert.equal(overLimitAllocation.quotaDeducibile, FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP - 450);
  assert.equal(Math.round(overLimitAllocation.quotaExtraPac * 100), 115000);
  assert.equal(overLimitAllocation.quotaDatore, 450);
});
