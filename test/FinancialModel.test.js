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
  assert.equal(result.breakeven, 24);
  assert.equal(result.quotaDatoreFp, 450);
  assert.equal(result.risparmioImposta, 39151);

  assert.deepEqual(result.results[0], {
    Anno: 1,
    'Entro Min': 300,
    'Extra Min': 2700,
    'Entro Ded': 3000,
    'Extra Ded': 0,
    Aderente: 3000,
    Datore: 450,
    Risparmio: 900,
    'Exit FP': 3970,
    'Exit PAC': 3178,
    'Exit Mix': 3970
  });

  assert.deepEqual(result.results.at(-1), {
    Anno: 30,
    'Entro Min': 300,
    'Extra Min': 4026,
    'Entro Ded': 4326,
    'Extra Ded': 0,
    Aderente: 4326,
    Datore: 450,
    Risparmio: 1326,
    'Exit FP': 258836,
    'Exit PAC': 295008,
    'Exit Mix': 258836
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
  assert.equal(result.results[0]['Exit FP'], 4030);
});

test('le ulteriori detrazioni riducono il beneficio se manca capienza fiscale', () => {
  const model = new FinancialModel();
  const config = {
    ...baseConfig,
    durata: 1,
    reddito: 12000,
    quotaDatoreFpPerc: 0,
    quotaMinAderentePerc: 0
  };

  assert.equal(model.calculateResults(config).results[0].Risparmio, 551);
  assert.equal(model.calculateResults({ ...config, ulterioriDetrazioni: 500 }).results[0].Risparmio, 51);
  assert.equal(model.calculateResults({ ...config, ulterioriDetrazioni: 2000 }).results[0].Risparmio, 0);
});

test('converte i risultati in CSV con intestazione coerente', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({ ...baseConfig, durata: 1 });

  assert.equal(
    model.convertToCSV(result.results),
    'Anno,Entro Min,Extra Min,Entro Ded,Extra Ded,Aderente,Datore,Risparmio,Exit FP,Exit PAC,Exit Mix\r\n' +
      '1,300,2700,3000,0,3000,450,900,3970,3178,3970\r\n'
  );
});
