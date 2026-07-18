import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateBonusCuneoFiscale,
  calculateEmployeeDeduction,
  calculateIncomeTax,
  calculateIrpefTaxableIncome,
  calculateTaxComparison,
  calculateTaxSavings,
  calculateTrattamentoIntegrativo,
  splitFpPayment
} from '../js/calculators/tax-calculator.js';

test('calcola imposta e detrazioni da lavoro dipendente', () => {
  assert.equal(calculateIncomeTax(28000), 6440);
  assert.equal(calculateIncomeTax(50000), 13700);
  assert.equal(calculateEmployeeDeduction(12000), 1955);
  assert.equal(calculateEmployeeDeduction(15000), 1955);
});

test('calcola imponibile IRPEF con massimale INPS e IVS aggiuntivo', () => {
  assert.equal(Math.round(calculateIrpefTaxableIncome({
    reddito: 150000,
    contributiInpsPerc: 0.0919,
    massimaleContributivoInps: 120607,
    sogliaIvsAggiuntivo: 55448,
    aliquotaIvsAggiuntivaPerc: 0.01
  })), 138265);
});

test('calcola bonus cuneo ed ex Bonus Renzi', () => {
  assert.equal(Math.round(calculateBonusCuneoFiscale(8000)), 568);
  assert.equal(Math.round(calculateBonusCuneoFiscale(30000)), 1000);
  assert.equal(calculateBonusCuneoFiscale(41000), 0);
  assert.equal(calculateTrattamentoIntegrativo({
    reddito: 12000,
    impostaLorda: 1000,
    detrazioniLavoro: 900
  }), 1200);
});

test('calcola split versamento FP e risparmio fiscale', () => {
  assert.deepEqual(splitFpPayment(3000, 300, 'quotaMinimaBusta'), {
    quotaBusta: 300,
    quotaBonifico: 2700
  });
  assert.equal(Math.round(calculateTaxSavings({
    reddito: 30000,
    investimento: 3000,
    quotaDatoreFp: 450,
    addizionaliPerc: 0.02,
    quotaMinAderente: 300,
    modalitaVersamentoFp: 'quotaMinimaBusta'
  })), 777);
});

test('sterilizza il taglio IRPEF riducendo le detrazioni, con soglia sul reddito complessivo', () => {
  // RAL 213.900 → imponibile ≈ 202.000 (INPS al massimale), appena sopra soglia.
  const inputs = { reddito: 213900, investimento: 5300, quotaDatoreFp: 0, ulterioriDetrazioni: 1000 };

  // Il bonifico è onere deducibile: non abbassa il reddito complessivo,
  // la sterilizzazione resta e il beneficio è il solo 43% marginale.
  const bonifico = calculateTaxComparison({ ...inputs, modalitaVersamentoFp: 'tuttoBonifico' });
  assert.equal(bonifico.before.highIncomeDeductionsCut, 440);
  assert.equal(bonifico.after.highIncomeDeductionsCut, 440);
  assert.equal(Math.round(bonifico.saving), 2279);

  // La quota in busta invece abbassa il reddito complessivo sotto soglia:
  // le detrazioni tornano piene e il beneficio recupera anche i 440€.
  const busta = calculateTaxComparison({ ...inputs, modalitaVersamentoFp: 'tuttoBusta' });
  assert.equal(busta.after.highIncomeDeductionsCut, 0);
  assert.equal(Math.round(busta.saving), 2719);

  // Senza detrazioni da ridurre la sterilizzazione è incapiente.
  const incapiente = calculateTaxComparison({ ...inputs, ulterioriDetrazioni: 0, modalitaVersamentoFp: 'tuttoBusta' });
  assert.equal(Math.round(incapiente.saving), 2279);
});

test('espone il confronto fiscale completo senza FP e con FP', () => {
  const comparison = calculateTaxComparison({
    reddito: 32304,
    investimento: 3000,
    quotaDatoreFp: 450,
    contributiInpsPerc: 0.0919,
    addizionaliPerc: 0.02,
    ulterioriDetrazioni: 4600,
    quotaMinAderente: 1500,
    quotaBustaFp: 3000
  });

  assert.equal(comparison.deduction, 3000);
  assert.equal(comparison.payrollContribution, 3000);
  assert.equal(Math.round(comparison.before.fiscalCost - comparison.after.fiscalCost), Math.round(comparison.saving));
  assert.ok(comparison.before.taxableIncome > comparison.after.taxableIncome);
  assert.ok(Number.isFinite(comparison.before.taxWedgeBonus));
  assert.ok(Number.isFinite(comparison.after.employeeDeduction));
});
