import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_FISCAL_RULES } from '../js/constants/fiscal-rules.js';
import { buildFiscalThresholdInsights, getPresentedAllocation } from '../js/utils/result-presentation.js';

test('assorbe nel FP mostrato un PAC inferiore a un euro', () => {
  const allocation = getPresentedAllocation({
    investimentoLordo: 3932,
    quotaFpConsigliata: 3931,
    quotaPacConsigliata: 1,
    scelta: 'FP',
    _allocation: {
      quotaFp: 3931,
      quotaPac: 0.5915,
      investimentoLordo: 3931.5915,
      pacResidualTechnical: true
    }
  });

  assert.deepEqual(allocation, { choice: 'FP', fp: 3932, pac: 0, gross: 3932 });
  assert.equal(allocation.fp + allocation.pac, allocation.gross);
});

test('mantiene riconciliabile una vera allocazione mista', () => {
  const allocation = getPresentedAllocation({
    investimentoLordo: 3096,
    quotaFpConsigliata: 300,
    quotaPacConsigliata: 2796,
    scelta: 'MIX'
  });

  assert.deepEqual(allocation, { choice: 'MIX', fp: 300, pac: 2796, gross: 3096 });
  assert.equal(allocation.fp + allocation.pac, allocation.gross);
});

test('evidenzia le soglie fiscali attraversate dal versamento FP', () => {
  const insights = buildFiscalThresholdInsights({
    rules: CURRENT_FISCAL_RULES,
    taxComparison: {
      before: {
        taxableIncome: 50500,
        employeeDeduction: 0,
        supplementaryTreatment: 0,
        taxWedgeBonus: 0,
        highIncomeDeductionsCut: 0,
        netTax: 15000
      },
      after: {
        taxableIncome: 49500,
        employeeDeductionIncome: 49500,
        employeeDeduction: 43,
        supplementaryTreatment: 0,
        taxWedgeBonus: 0,
        highIncomeDeductionsCut: 0,
        netTax: 14500
      }
    }
  });

  const irpef = insights.find((item) => item.id === 'irpef');
  assert.equal(irpef.status, 'crossed');
  assert.deepEqual(irpef.crossedThresholds.map((item) => item.value), [50000]);
  assert.deepEqual(irpef.thresholds, [
    { value: 28000, label: 'aliquota 33%' },
    { value: 50000, label: 'aliquota 43%' }
  ]);
  assert.equal(irpef.beforeResult, 0.43);
  assert.equal(irpef.afterResult, 0.33);

  const employeeDeduction = insights.find((item) => item.id === 'employee-deduction');
  assert.equal(employeeDeduction.status, 'crossed');
  assert.deepEqual(employeeDeduction.crossedThresholds.map((item) => item.value), [50000]);

  const supplementaryTreatment = insights.find((item) => item.id === 'supplementary-treatment');
  assert.deepEqual(supplementaryTreatment.thresholds, [
    { value: 15000, label: 'fascia condizionata' },
    { value: 28000, label: 'fine accesso' }
  ]);

  insights.flatMap((item) => item.thresholds).forEach((threshold) => {
    assert.ok(threshold.label.length <= 20, threshold.label);
  });
});

test('distingue la base IRPEF dalla base di detrazioni e bonus', () => {
  const insights = buildFiscalThresholdInsights({
    rules: CURRENT_FISCAL_RULES,
    taxComparison: {
      before: {
        taxableIncome: 30000,
        employeeDeduction: 1800,
        supplementaryTreatment: 0,
        taxWedgeBonus: 1000,
        taxWedgeCashAmount: 0,
        taxWedgeDeductionUsed: 1000,
        netTax: 5000
      },
      after: {
        taxableIncome: 27000,
        employeeDeductionIncome: 30000,
        employeeDeduction: 1800,
        supplementaryTreatment: 0,
        taxWedgeBonus: 1000,
        taxWedgeCashAmount: 0,
        taxWedgeDeductionUsed: 1000,
        netTax: 4100
      }
    }
  });

  const irpef = insights.find((item) => item.id === 'irpef');
  const employeeDeduction = insights.find((item) => item.id === 'employee-deduction');
  const wedgeDeduction = insights.find((item) => item.id === 'tax-wedge-access');
  assert.deepEqual(irpef.crossedThresholds.map((item) => item.value), [28000]);
  assert.equal(employeeDeduction.afterIncome, 30000);
  assert.deepEqual(employeeDeduction.crossedThresholds, []);
  assert.equal(wedgeDeduction.beforeResult, 1000);
  assert.equal(wedgeDeduction.afterResult, 1000);
});
