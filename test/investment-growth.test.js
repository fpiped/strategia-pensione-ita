import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyFpAnnualGrowth,
  applyPacAnnualGrowth,
  applyYearGrowth,
  calculateEffectiveTaxRate,
  calculateFpExit,
  calculateNetAnnualReturn,
  calculatePacExit,
  calculateStrategyExit,
  createGrowthOptions,
  projectFpContribution,
  projectPacContribution
} from '../js/calculators/investment-growth.js';

test('applica rendimento PAC netto senza ulteriori costi o tasse modellate', () => {
  assert.equal(Math.round(applyPacAnnualGrowth(0, 1000, 0.08) * 100), 100000);
  assert.equal(Math.round(projectPacContribution(1000, 0.08, 2) * 100), 108000);
});

test('calcola aliquota effettiva da quota agevolata e ordinaria', () => {
  assert.equal(calculateEffectiveTaxRate(0, 0.125, 0.20), 0.20);
  assert.equal(calculateEffectiveTaxRate(1, 0.125, 0.20), 0.125);
  assert.equal(Math.round(calculateEffectiveTaxRate(0.4, 0.125, 0.20) * 1000), 170);
  assert.equal(Math.round(calculateEffectiveTaxRate(0.4, 0.125, 0.26) * 1000), 206);
});

test('applica tassazione annuale e costi al rendimento lordo FP', () => {
  const options = createGrowthOptions({
    mode: 'lordo',
    costiAnnui: 0.01,
    quotaAgevolataPerc: 0.4,
    aliquotaAgevolata: 0.125,
    aliquotaOrdinaria: 0.20
  });

  assert.equal(Math.round(options.taxRate * 1000), 170);
  assert.equal(Math.round(calculateNetAnnualReturn(0.10, { ...options, taxTiming: 'annual' }) * 10000), 722);
  assert.equal(Math.round(applyFpAnnualGrowth(0, 1000, 0.10, options)), 1000);
  assert.equal(Math.round(projectFpContribution(1000, 0.10, 2, options)), 1072);
});

test('applica costi annui PAC durante la crescita e tassazione alla exit', () => {
  const options = createGrowthOptions({
    mode: 'lordo',
    costiAnnui: 0.002,
    quotaAgevolataPerc: 0.2,
    aliquotaAgevolata: 0.125,
    aliquotaOrdinaria: 0.26
  });
  const montante = projectPacContribution(1000, 0.08, 2, options);

  assert.equal(options.taxRate, 0.233);
  assert.equal(Math.round(montante), 1078);
  assert.equal(Math.round(calculatePacExit(montante, 1000, options)), 1060);
});

test('aggiorna lo stato annuale di FP, PAC e risparmio fiscale', () => {
  const state = {
    montanteFP: 1000,
    contributiFP: 1000,
    montantePAC: 1000,
    investimentoPAC: 1000,
    risparmioAccumulato: 100,
    risparmioDaReinvestire: 0
  };

  applyYearGrowth(state, {
    fpContributo: 500,
    pacContributo: 200,
    risparmioAnno: 80,
    rFP: 0.04,
    rPAC: 0.08,
    reinvestiRisparmio: true
  });

  assert.equal(state.montanteFP, 1540);
  assert.equal(state.contributiFP, 1500);
  assert.equal(Math.round(state.montantePAC), 1280);
  assert.equal(state.investimentoPAC, 1200);
  assert.equal(state.risparmioAccumulato, 180);
  assert.equal(state.risparmioDaReinvestire, 80);
});

test('calcola exit netta FP e PAC', () => {
  assert.equal(calculateFpExit({
    montante: 5000,
    contributi: 3000,
    tassazione: 0.15,
    risparmioAnno: 100,
    risparmioAccumulato: 500,
    reinvestiRisparmio: true
  }), 4650);

  assert.equal(calculatePacExit(1200, 1000), 1200);
});

test('calcola exit complessiva strategia con o senza risparmio fiscale', () => {
  const state = {
    montanteFP: 5000,
    contributiFP: 3000,
    montantePAC: 1200,
    investimentoPAC: 1000,
    risparmioAccumulato: 500,
    risparmioDaReinvestire: 100
  };

  assert.equal(calculateStrategyExit(state, 0.15, true), 5850);
  assert.equal(calculateStrategyExit(state, 0.15, true, false), 5750);
});
