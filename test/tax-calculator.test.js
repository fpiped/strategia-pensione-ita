import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateBonusCuneoFiscale,
  calculateEmployeeDeduction,
  calculateIncomeTax,
  calculateIrpefTaxableIncome,
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
