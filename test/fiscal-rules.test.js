import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_FISCAL_RULES, CURRENT_FISCAL_YEAR, FISCAL_RULES } from '../js/constants/fiscal-rules.js';
import { FINANCIAL_CONSTANTS } from '../js/constants/financial-constants.js';
import { calculateIncomeTax, calculateMarginalIncomeTaxRate } from '../js/calculators/tax-calculator.js';

test('espone regole fiscali complete per l anno corrente', () => {
  assert.equal(CURRENT_FISCAL_YEAR, 2026);
  assert.equal(FISCAL_RULES[CURRENT_FISCAL_YEAR], CURRENT_FISCAL_RULES);
  assert.equal(CURRENT_FISCAL_RULES.meta.year, CURRENT_FISCAL_YEAR);
  assert.match(CURRENT_FISCAL_RULES.meta.effectiveFrom, /^2026-/);
  assert.ok(CURRENT_FISCAL_RULES.documentation.length > 0);
  for (const item of CURRENT_FISCAL_RULES.documentation) {
    assert.ok(item.id && item.title && item.effective);
    assert.ok(item.sources.length > 0);
    item.sources.forEach((source) => assert.match(source.url, /^https:\/\//));
  }
});

test('mantiene scaglioni IRPEF ordinati, continui e con aliquote valide', () => {
  const brackets = CURRENT_FISCAL_RULES.irpef.brackets;
  assert.equal(brackets.at(-1).upTo, Infinity);
  brackets.forEach((bracket, index) => {
    assert.ok(bracket.rate >= 0 && bracket.rate <= 1);
    if (index > 0) assert.ok(bracket.upTo > brackets[index - 1].upTo);
  });

  assert.equal(calculateMarginalIncomeTaxRate(28000), 0.23);
  assert.equal(calculateMarginalIncomeTaxRate(28000.01), 0.33);
  assert.equal(calculateMarginalIncomeTaxRate(50000.01), 0.43);
  assert.equal(calculateIncomeTax(28000), 6440);
  assert.equal(calculateIncomeTax(50000), 13700);
});

test('deriva le costanti compatibili dalla configurazione fiscale', () => {
  const rules = CURRENT_FISCAL_RULES;
  assert.equal(FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP, rules.pensionFund.deductionLimit);
  assert.equal(FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS, rules.inps.contributionCeiling);
  assert.equal(FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO, rules.inps.additionalIvsThreshold);
  assert.equal(rules.inps.contributionCeiling, 122295);
  assert.equal(rules.inps.additionalIvsThreshold, 56224);
  assert.equal(FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_RIDUZIONE_DETRAZIONE, rules.supplementaryTreatment.capienzaDeductionReduction);
  assert.equal(rules.supplementaryTreatment.capienzaDeductionReduction, 75);
  assert.equal(FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_FP_ORDINARIA, rules.investmentTax.pensionFundOrdinaryRate);
  assert.equal(FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_PAC_ORDINARIA, rules.investmentTax.pacOrdinaryRate);
});
