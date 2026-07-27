import assert from 'node:assert/strict';
import test from 'node:test';

import { FinancialModel } from '../js/models/FinancialModel.js';
import { CURRENT_FISCAL_RULES } from '../js/constants/fiscal-rules.js';

const BASE = {
  durata: 8,
  reddito: 30000,
  investimento: 5000,
  quotaDatoreFpPerc: 0.015,
  quotaMinAderentePerc: 0.01,
  rendimentoAnnualeFpPerc: 0.04,
  rendimentoAnnualePacPerc: 0.06,
  modalitaCumulativa: true,
  riscattoAnticipato: false
};

const makeRandom = (initialSeed) => {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
};

test('stress deterministico: risultati finiti e budget riconciliato ai limiti', () => {
  const random = makeRandom(0x5eed2026);
  const model = new FinancialModel();

  for (let index = 0; index < 16; index++) {
    const config = {
      ...BASE,
      durata: 1 + Math.floor(random() * 6),
      reddito: Math.round(random() * 250000),
      investimento: Math.round(random() * 20000),
      quotaDatoreFpPerc: random() * 0.05,
      quotaMinAderentePerc: random() * 0.05,
      rendimentoAnnualeFpPerc: random() * 0.1,
      rendimentoAnnualePacPerc: random() * 0.1,
      rendimentoFpMode: random() < 0.5 ? 'netto' : 'lordo',
      rendimentoPacMode: random() < 0.5 ? 'netto' : 'lordo',
      costiAnnuiFpPerc: random() * 0.03,
      costiAnnuiPacPerc: random() * 0.03,
      costiFissiFp: random() * 150,
      costiFissiPac: random() * 150,
      altriRedditi: random() * 30000,
      premiStraordinari: random() * 10000
    };
    const output = model.calculateResults(config);

    assert.deepEqual(output.strategies.map(({ id }) => id), [
      'optimized',
      'all-pac',
      'minimum-employer',
      'maximum-fp'
    ]);
    for (const strategy of output.strategies) {
      assert.ok(Number.isFinite(strategy.exit), `${index}/${strategy.id}: exit`);
      for (const row of strategy.results) {
        const allocation = row._allocation;
        assert.ok(Number.isFinite(row.exitOttimale), `${index}/${strategy.id}: exit annuale`);
        assert.ok(Math.abs(allocation.budgetDifference) <= 1e-6, `${index}/${strategy.id}: budget`);
        assert.ok(
          row.quotaFpDeducibile + row.quotaDatoreDeducibile
            <= CURRENT_FISCAL_RULES.pensionFund.deductionLimit + 1e-6,
          `${index}/${strategy.id}: limite deduzione`
        );
      }
    }
    assert.equal(output.strategies.find(({ id }) => id === 'all-pac').totals.fpPersonale, 0);
    assert.equal(output.strategies.find(({ id }) => id === 'maximum-fp').totals.pac, 0);
  }
});

test('la ricerca accelerata coincide con la scansione esaustiva su casi avversi', () => {
  const random = makeRandom(0xa110ca7e);
  const model = new FinancialModel();
  const deductionLimit = CURRENT_FISCAL_RULES.pensionFund.deductionLimit;

  for (let index = 0; index < 12; index++) {
    const config = model._normalizeConfig({
      ...BASE,
      durata: 1 + Math.floor(random() * 15),
      reddito: 10000 + random() * 240000,
      investimento: 5000 + random() * 25000,
      quotaDatoreFpPerc: random() * 0.04,
      quotaMinAderentePerc: random() * 0.04,
      rendimentoAnnualeFpPerc: random() * 0.1,
      rendimentoAnnualePacPerc: random() * 0.1,
      rendimentoFpMode: random() < 0.5 ? 'netto' : 'lordo',
      rendimentoPacMode: random() < 0.5 ? 'netto' : 'lordo',
      costiAnnuiFpPerc: random() * 0.03,
      costiAnnuiPacPerc: random() * 0.03,
      costiFissiFp: random() * 300,
      costiFissiPac: random() * 300
    });
    const context = model._computeYearContext(config, 1);
    const evaluator = model._createYearAllocationEvaluator(
      config,
      context,
      model._createPlanState(),
      model._createGrowthOptions(config),
      model.calcolaTassazioneFp(
        config.anzianitaPregressaFp + config.durata - 1,
        config.riscattoAnticipato
      )
    );
    const fast = evaluator.findOptimal();
    const maxWithoutEmployer = deductionLimit;
    const maxWithEmployer = Math.max(
      deductionLimit - context.quotaDatorePotenziale,
      0
    );
    const exactCandidates = [
      0,
      maxWithoutEmployer,
      maxWithEmployer,
      Math.max(context.quotaMinAderente, 0)
    ];
    let maximumSaving = 0;
    for (let quota = 0; quota <= Math.floor(maxWithoutEmployer); quota++) {
      maximumSaving = Math.max(
        maximumSaving,
        evaluator.getFiscalAllocation(quota).risparmio
      );
    }
    exactCandidates.forEach((quota) => {
      maximumSaving = Math.max(
        maximumSaving,
        evaluator.getFiscalAllocation(quota).risparmio
      );
    });
    const maximumGross = Math.max(context.netInvestmentTarget + maximumSaving, 0);
    exactCandidates.push(maximumGross);

    let exhaustive = null;
    const compare = (quota) => {
      const allocation = evaluator.evaluate(quota);
      if (
        allocation
        && (!exhaustive || allocation.valore > exhaustive.valore + 1e-9)
      ) exhaustive = allocation;
    };
    for (let quota = 0; quota <= Math.floor(maximumGross); quota++) compare(quota);
    exactCandidates.forEach(compare);

    assert.ok(Math.abs(fast.valore - exhaustive.valore) <= 0.005, `caso ${index}`);
    assert.ok(Math.abs(fast.quotaFp - exhaustive.quotaFp) <= 1.01, `caso ${index}`);
  }
});

test('il massimo budget pubblico resta calcolabile e riconciliato', () => {
  const model = new FinancialModel();
  const output = model.calculateResults({
    ...BASE,
    durata: 3,
    investimento: 250_000
  });

  assert.equal(output.results.length, 3);
  assert.ok(Number.isFinite(output.results.at(-1).exitOttimale));
  output.strategies.forEach((strategy) => {
    strategy.results.forEach((row) => {
      assert.ok(Math.abs(row._allocation.budgetDifference) <= 1e-6);
    });
  });
});
