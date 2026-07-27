import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateEmployeeDeduction,
  calculateIncomeTax,
  calculateIrpefTaxableIncome,
  calculateTaxComparison,
  calculateTaxSavings,
  calculateTaxWedgeSupport,
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

test('distingue somma e detrazione cuneo ed ex Bonus Renzi', () => {
  assert.deepEqual(calculateTaxWedgeSupport(8000), { cashAmount: 568, taxDeduction: 0 });
  assert.deepEqual(calculateTaxWedgeSupport(12000), { cashAmount: 636, taxDeduction: 0 });
  assert.deepEqual(calculateTaxWedgeSupport(18000), { cashAmount: 864, taxDeduction: 0 });
  assert.deepEqual(calculateTaxWedgeSupport(30000), { cashAmount: 0, taxDeduction: 1000 });
  assert.deepEqual(calculateTaxWedgeSupport(36000), { cashAmount: 0, taxDeduction: 500 });
  assert.deepEqual(calculateTaxWedgeSupport(41000), { cashAmount: 0, taxDeduction: 0 });
  assert.equal(calculateTrattamentoIntegrativo({
    redditoComplessivo: 12000,
    impostaLordaLavoro: 1000,
    impostaLordaComplessiva: 1000,
    detrazioniLavoro: 900
  }), 1200);
});

test('il trattamento fino a 15.000 euro usa solo l IRPEF lorda da lavoro', () => {
  const mixedIncome = calculateTaxComparison({
    reddito: 6000,
    altriRedditi: 6000,
    investimento: 0,
    quotaDatoreFp: 0,
    contributiInpsPerc: 0
  });
  const workOnly = calculateTaxComparison({
    reddito: 12000,
    altriRedditi: 0,
    investimento: 0,
    quotaDatoreFp: 0,
    contributiInpsPerc: 0
  });

  assert.equal(mixedIncome.before.supplementaryTreatmentTotalGrossTax, 2760);
  assert.equal(mixedIncome.before.supplementaryTreatmentWorkGrossTax, 1380);
  assert.equal(mixedIncome.before.supplementaryTreatment, 0);
  assert.equal(workOnly.before.supplementaryTreatmentWorkGrossTax, 2760);
  assert.equal(workOnly.before.supplementaryTreatment, 1200);
});

test('rispetta i confini tra somma, detrazione piena e décalage del cuneo', () => {
  assert.deepEqual(calculateTaxWedgeSupport(20000), { cashAmount: 960, taxDeduction: 0 });
  assert.deepEqual(calculateTaxWedgeSupport(20000.01), { cashAmount: 0, taxDeduction: 1000 });
  assert.deepEqual(calculateTaxWedgeSupport(32000), { cashAmount: 0, taxDeduction: 1000 });
  assert.ok(calculateTaxWedgeSupport(32000.01).taxDeduction < 1000);
  assert.deepEqual(calculateTaxWedgeSupport(40000), { cashAmount: 0, taxDeduction: 0 });
});

test('limita la detrazione cuneo alla capienza prima delle addizionali', () => {
  const comparison = calculateTaxComparison({
    reddito: 25000,
    investimento: 0,
    quotaDatoreFp: 0,
    contributiInpsPerc: 0,
    detrazioniOrdinarie: 3500,
    localTaxRules: [{ rate: 0.02 }]
  });

  assert.equal(comparison.before.taxWedgeCashAmount, 0);
  assert.equal(comparison.before.taxWedgeDeduction, 1000);
  assert.ok(comparison.before.taxWedgeDeductionUsed > 0);
  assert.ok(comparison.before.taxWedgeDeductionUsed < 1);
  assert.equal(comparison.before.irpefNetTax, 0);
  assert.equal(comparison.before.localTaxes, 0);
  assert.equal(comparison.before.netTax, 0);
  assert.equal(comparison.before.fiscalCost, 0);
});

test('la somma cuneo sotto 20.000 euro non è limitata dalla capienza', () => {
  const comparison = calculateTaxComparison({
    reddito: 18000,
    investimento: 0,
    quotaDatoreFp: 0,
    contributiInpsPerc: 0,
    detrazioniOrdinarie: 10000
  });

  assert.equal(comparison.before.irpefNetTax, 0);
  assert.equal(comparison.before.taxWedgeCashAmount, 864);
  assert.equal(comparison.before.taxWedgeDeduction, 0);
  assert.equal(comparison.before.taxWedgeBonus, 864);
  assert.ok(comparison.before.fiscalCost < 0);
});

test('solo le detrazioni rilevanti concorrono al trattamento integrativo', () => {
  const inputs = {
    reddito: 20000,
    investimento: 0,
    quotaDatoreFp: 0,
    contributiInpsPerc: 0
  };
  const ordinary = calculateTaxComparison({
    ...inputs,
    detrazioniOrdinarie: 2500
  });
  const relevant = calculateTaxComparison({
    ...inputs,
    detrazioniTrattamentoIntegrativo: 2500
  });

  // Entrambe abbattono allo stesso modo l'IRPEF.
  assert.equal(ordinary.before.irpefNetTax, relevant.before.irpefNetTax);
  assert.equal(ordinary.before.irpefNetTax, 0);
  // Solo il secondo gruppo entra nella formula speciale 15.000-28.000 €.
  assert.equal(ordinary.before.supplementaryTreatment, 0);
  assert.ok(relevant.before.supplementaryTreatment > 500);
  assert.equal(ordinary.before.ordinaryDeductions, 2500);
  assert.equal(relevant.before.supplementaryTreatmentDeductions, 2500);
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
    localTaxRules: [{ rate: 0.02 }],
    quotaMinAderente: 300,
    modalitaVersamentoFp: 'quotaMinimaBusta'
  })), 777);
});

test('ricalcola le addizionali su ogni imponibile e intercetta le esenzioni', () => {
  const comparison = calculateTaxComparison({
    reddito: 27000,
    investimento: 5000,
    quotaDatoreFp: 0,
    contributiInpsPerc: 0,
    modalitaVersamentoFp: 'tuttoBonifico',
    localTaxRules: [
      { rate: 0.015, exemption: 0 },
      { rate: 0.008, exemption: 23000 }
    ]
  });

  assert.equal(comparison.before.localTaxes, 621);
  assert.equal(comparison.after.localTaxes, 330);
  assert.equal(comparison.before.localTaxes - comparison.after.localTaxes, 291);
  assert.deepEqual(comparison.before.localTaxComponents, [405, 216]);
  assert.deepEqual(comparison.after.localTaxComponents, [330, 0]);
});

test('sterilizza il taglio IRPEF riducendo le detrazioni, con soglia sul reddito complessivo', () => {
  // RAL 213.900 → imponibile ≈ 202.000 (INPS al massimale), appena sopra soglia.
  const inputs = { reddito: 213900, investimento: 5300, quotaDatoreFp: 0, detrazioniOrdinarie: 1000 };

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
  const incapiente = calculateTaxComparison({ ...inputs, detrazioniOrdinarie: 0, modalitaVersamentoFp: 'tuttoBusta' });
  assert.equal(Math.round(incapiente.saving), 2279);
});

test('espone il confronto fiscale completo senza FP e con FP', () => {
  const comparison = calculateTaxComparison({
    reddito: 32304,
    investimento: 3000,
    quotaDatoreFp: 450,
    contributiInpsPerc: 0.0919,
    localTaxRules: [{ rate: 0.02 }],
    detrazioniOrdinarie: 4600,
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
