import assert from 'node:assert/strict';
import test from 'node:test';

import { FinancialModel } from '../js/models/FinancialModel.js';

const baseConfig = {
  durata: 30,
  reddito: 30000,
  investimento: 3000,
  quotaDatoreFpPerc: 0.015,
  quotaMinAderentePerc: 0.01,
  rendimentoAnnualeFpPerc: 0.04,
  rendimentoAnnualePacPerc: 0.08,
  reinvestiRisparmio: true,
  modalitaCumulativa: true,
  riscattoAnticipato: false
};

test('calcola lo scenario cumulativo predefinito', () => {
  const model = new FinancialModel();
  const result = model.calculateResults(baseConfig);

  assert.equal(result.results.length, 30);
  assert.equal(result.breakeven, 25);
  assert.equal(result.quotaDatoreFp, 450);
  assert.equal(result.risparmioImposta, 10609);

  assert.deepEqual(result.results[0], {
    Anno: 1,
    'Entro Min': 300,
    'Extra Min': 2700,
    'Entro Ded': 3000,
    'Extra Ded': 0,
    Aderente: 3000,
    Datore: 450,
    Risparmio: 96,
    'FP Cons': 300,
    'PAC Cons': 2700,
    Scelta: 'MIX',
    'Exit FP': 3970,
    'Exit PAC': 3173,
    'Exit Mix': 3619
  });

  assert.deepEqual(result.results.at(-1), {
    Anno: 30,
    'Entro Min': 300,
    'Extra Min': 4024,
    'Entro Ded': 4324,
    'Extra Ded': 0,
    Aderente: 4324,
    Datore: 450,
    Risparmio: 1325,
    'FP Cons': 4324,
    'PAC Cons': 0,
    Scelta: 'FP',
    'Exit FP': 258836,
    'Exit PAC': 283955,
    'Exit Mix': 309702
  });
});

test('non riconosce contributo datore se la quota minima non e raggiunta', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    investimento: 100,
    durata: 1
  });

  assert.equal(result.quotaDatoreFp, 0);
  assert.equal(result.results[0].Datore, 0);
  assert.equal(result.results[0]['Entro Min'], 100);
});

test('applica il riscatto anticipato al 23%', () => {
  const model = new FinancialModel();
  const ordinary = model.calculateResults({
    ...baseConfig,
    durata: 1,
    riscattoAnticipato: false
  });
  const earlyExit = model.calculateResults({
    ...baseConfig,
    durata: 1,
    riscattoAnticipato: true
  });

  assert.equal(model.calcolaTassazioneFp(1, false), 0.15);
  assert.equal(model.calcolaTassazioneFp(1, true), 0.23);
  assert.ok(earlyExit.results[0]['Exit FP'] < ordinary.results[0]['Exit FP']);
});

test('calcola gli scaglioni IRPEF 2025 aggiornati alla Legge 207/2024', () => {
  const model = new FinancialModel();

  assert.equal(model.calcolaImposta(28000), 6440);
  assert.equal(model.calcolaImposta(50000), 14140);
  assert.equal(model.calcolaImposta(60000), 18440);
});

test('calcola la detrazione minima lavoro dipendente 2025 aggiornata alla Legge 207/2024', () => {
  const model = new FinancialModel();

  assert.equal(model.calcolaDetrazioniDipendente(12000), 1955);
  assert.equal(model.calcolaDetrazioniDipendente(15000), 1955);
});

test('include addizionali stimate nel risparmio fiscale', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    addizionaliPerc: 0.02
  });

  assert.equal(result.results[0].Risparmio, 960);
  assert.equal(result.results[0]['FP Cons'], 3000);
  assert.equal(result.results[0]['PAC Cons'], 0);
  assert.equal(result.results[0]['Exit FP'], 4030);
  assert.equal(result.results[0]['Exit Mix'], 4030);
});

test('le ulteriori detrazioni riducono il beneficio fiscale se manca capienza', () => {
  const model = new FinancialModel();

  assert.equal(Math.round(model._calculateTaxSavings(12000, 3000, 0)), 551);
  assert.equal(Math.round(model._calculateTaxSavings(12000, 3000, 0, 0, 500)), 51);
  assert.equal(Math.round(model._calculateTaxSavings(12000, 3000, 0, 0, 2000)), 0);
});

test('applica il bollo annuo dello 0.2% al PAC', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    investimento: 3000,
    rendimentoAnnualePacPerc: 0.08
  });

  assert.equal(result.results[0]['Exit PAC'], 3173);
  assert.ok(result.results[0]['Exit PAC'] < 3178);
});

test('manda sempre nel PAC la quota oltre deduzione', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    investimento: 8000,
    addizionaliPerc: 0.02
  });

  assert.equal(result.results[0]['Entro Ded'], 4715);
  assert.equal(result.results[0]['Extra Ded'], 3285);
  assert.equal(result.results[0]['FP Cons'], 4715);
  assert.equal(result.results[0]['PAC Cons'], 3285);
  assert.equal(result.results[0].Scelta, 'MIX');
});

test('applica la maggiorazione deducibile per prima occupazione post 2006', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 2,
    investimento: 8000,
    addizionaliPerc: 0.02,
    primaOccupazionePost2006: true,
    plafondExtraPrimaOccupazione: 3000,
    anniResiduiMaggiorazione: 20
  });

  assert.equal(result.results[0]['Entro Ded'], 7297);
  assert.equal(result.results[0]['Extra Ded'], 703);
  assert.equal(result.results[0]['FP Cons'], 7297);
  assert.equal(result.results[0].Risparmio, 2427);

  assert.equal(result.results[1]['Entro Ded'], 5132);
  assert.equal(result.results[1]['Extra Ded'], 5295);
});

test('il mix consigliato puo dividere la quota deducibile prima del FP pieno', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    addizionaliPerc: 0.02
  });

  assert.equal(result.breakeven, 25);
  assert.equal(result.results[0].Scelta, 'MIX');
  assert.equal(result.results[19].Scelta, 'MIX');
  assert.equal(result.results[23].Scelta, 'MIX');
  assert.equal(result.results[24].Scelta, 'FP');
  assert.equal(result.results.at(-1).Scelta, 'FP');
  assert.ok(result.results.at(-1)['Exit Mix'] > result.results.at(-1)['Exit PAC']);
});

test('il mix consigliato non e inferiore agli scenari puri sull exit finale', () => {
  const model = new FinancialModel();
  const scenarios = [
    baseConfig,
    { ...baseConfig, addizionaliPerc: 0.02 },
    { ...baseConfig, rendimentoAnnualeFpPerc: 0.02, rendimentoAnnualePacPerc: 0.04, addizionaliPerc: 0.02 },
    { ...baseConfig, rendimentoAnnualeFpPerc: 0.05, rendimentoAnnualePacPerc: 0.10, addizionaliPerc: 0.02 },
    { ...baseConfig, investimento: 8000, addizionaliPerc: 0.02 },
    { ...baseConfig, riscattoAnticipato: true, addizionaliPerc: 0.02 }
  ];

  for (const config of scenarios) {
    const result = model.calculateResults(config);
    const finalRow = result.results.at(-1);

    assert.ok(finalRow['Exit Mix'] >= finalRow['Exit FP'] - 1);
    assert.ok(finalRow['Exit Mix'] >= finalRow['Exit PAC'] - 1);
  }
});

test('converte i risultati in CSV con intestazione coerente', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({ ...baseConfig, durata: 1 });

  assert.equal(
    model.convertToCSV(result.results),
    'Anno,Entro Min,Extra Min,Entro Ded,Extra Ded,Aderente,Datore,Risparmio,FP Cons,PAC Cons,Scelta,Exit FP,Exit PAC,Exit Mix\r\n' +
      '1,300,2700,3000,0,3000,450,900,3000,0,FP,3970,3173,3970\r\n'
  );
});
