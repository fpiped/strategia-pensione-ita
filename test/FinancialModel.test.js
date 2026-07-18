import assert from 'node:assert/strict';
import test from 'node:test';

import { FinancialModel } from '../js/models/FinancialModel.js';
import { calculateNetTaxDue } from '../js/calculators/tax-calculator.js';
import { applyFpAnnualGrowth, calculateNetAnnualReturn } from '../js/calculators/investment-growth.js';

const baseConfig = {
  durata: 30,
  reddito: 30000,
  investimento: 3000,
  quotaDatoreFpPerc: 0.015,
  quotaMinAderentePerc: 0.01,
  rendimentoAnnualeFpPerc: 0.04,
  rendimentoAnnualePacPerc: 0.06,
  reinvestiRisparmio: true,
  modalitaCumulativa: true,
  riscattoAnticipato: false
};

test('calcola lo scenario cumulativo predefinito', () => {
  const model = new FinancialModel();
  const result = model.calculateResults(baseConfig);

  assert.equal(result.results.length, 30);
  assert.equal(result.breakeven, null);
  assert.equal(result.quotaDatoreFp, 450);
  assert.equal(result.risparmioImposta, 11245);
  assert.ok(Number.isFinite(result.tir.mix));
  assert.ok(Number.isFinite(result.tir.fp));
  assert.ok(Math.abs(result.tir.pac - 0.06) < 0.0001);

  assert.deepEqual(result.results[0], {
    anno: 1,
    quotaEntroMinima: 300,
    quotaExtraMinima: 0,
    quotaEntroDeduzione: 300,
    quotaExtraDeduzione: 2796,
    quotaAderente: 3096,
    quotaDatore: 450,
    risparmioFiscale: 96,
    quotaFpConsigliata: 300,
    quotaFpDeducibile: 300,
    quotaFpNonDeducibile: 0,
    quotaDatoreDeducibile: 450,
    quotaPacConsigliata: 2796,
    quotaPacOltreLimite: 0,
    quotaFpBusta: 300,
    quotaFpBonifico: 0,
    diffBustaBonifico: 0,
    scelta: 'MIX',
    exitFp: 3725,
    exitPac: 3000,
    exitMix: 3434
  });

  assert.deepEqual(result.results.at(-1), {
    anno: 30,
    quotaEntroMinima: 300,
    quotaExtraMinima: 3631,
    quotaEntroDeduzione: 3931,
    quotaExtraDeduzione: 1,
    quotaAderente: 3932,
    quotaDatore: 450,
    risparmioFiscale: 932,
    quotaFpConsigliata: 3931,
    quotaFpDeducibile: 3931,
    quotaFpNonDeducibile: 0,
    quotaDatoreDeducibile: 450,
    quotaPacConsigliata: 1,
    quotaPacOltreLimite: 0,
    quotaFpBusta: 300,
    quotaFpBonifico: 3631,
    diffBustaBonifico: 267,
    scelta: 'MIX',
    exitFp: 231949,
    exitPac: 237175,
    exitMix: 263714
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
  assert.equal(result.results[0].quotaDatore, 0);
  assert.equal(result.results[0].quotaEntroMinima, 147);
});

test('riconosce un contributo datore fisso annuo', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    quotaDatoreFpPerc: 0,
    contributoDatoreFisso: 250
  });

  assert.equal(result.quotaDatoreFp, 250);
  assert.equal(result.results[0].quotaDatore, 250);
  assert.equal(result.results[0].quotaEntroMinima, 300);
});

test('tassa il FP lordo sul risultato netto maturato, dopo i costi', () => {
  // 4% lordo, 1% costi, 20%: prima i costi, poi l'imposta sul risultato.
  const net = calculateNetAnnualReturn(0.04, { mode: 'lordo', costiAnnui: 0.01, taxRate: 0.2, taxTiming: 'annual' });
  assert.equal(Number(net.toFixed(6)), 0.02368);

  // Anche il costo fisso riduce la base imponibile:
  // 1000 × 1.0296 − 25 = 1004.60; imposta = 4.60 × 20% = 0.92.
  const montante = applyFpAnnualGrowth(1000, 0, 0.04, { mode: 'lordo', costiAnnui: 0.01, costoFissoAnnuo: 25, taxRate: 0.2 });
  assert.equal(Number(montante.toFixed(2)), 1003.68);

  // In perdita nessuna imposta dovuta.
  const inPerdita = applyFpAnnualGrowth(1000, 0, 0, { mode: 'lordo', costoFissoAnnuo: 25, taxRate: 0.2 });
  assert.equal(inPerdita, 975);
});

test('applica e rende esplorabili i costi annui EUR di FP e PAC', () => {
  const model = new FinancialModel();
  const config = {
    ...baseConfig,
    durata: 2,
    rendimentoAnnualeFpPerc: 0,
    rendimentoAnnualePacPerc: 0,
    rendimentoFpMode: 'lordo',
    rendimentoPacMode: 'lordo',
    costiFissiFp: 25,
    costiFissiPac: 40
  };
  const result = model.calculateResults(config);
  const pacRows = result.strategies.pac;
  const explorer = model.buildAnnualExplorerData(config, pacRows, 2);

  assert.equal(pacRows.at(-1).exitPac, 5920);
  assert.equal(explorer.costoFissoFpAnno, 0);
  assert.equal(explorer.costoFissoPacAnno, 40);
  assert.equal(explorer.montantePac, 5920);
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
  assert.ok(earlyExit.results[0].exitFp < ordinary.results[0].exitFp);
});

test('applica anzianita pregressa FP alla tassazione in uscita', () => {
  const model = new FinancialModel();
  const senzaPregresso = model.calculateResults({
    ...baseConfig,
    durata: 1
  });
  const conPregresso = model.calculateResults({
    ...baseConfig,
    durata: 1,
    anzianitaPregressaFp: 20
  });

  assert.equal(model.calcolaTassazioneFp(20, false), 0.132);
  assert.ok(conPregresso.results[0].exitFp > senzaPregresso.results[0].exitFp);
});

test('gli altri redditi entrano nell IRPEF ma non nella base contributiva INPS', () => {
  const model = new FinancialModel();
  const config = {
    ...baseConfig,
    durata: 1,
    altriRedditi: 10000,
    quotaDatoreFpPerc: 0
  };
  const { results } = model.calculateResults(config);
  const anno1 = model.buildAnnualExplorerData(config, results, 1);

  // INPS solo sui 30.000 di RAL: 2.757. Imponibile = 27.243 + 10.000.
  assert.equal(Math.round(anno1.contributiInps), 2757);
  assert.equal(Math.round(anno1.imponibileIrpef), 37243);
});

test('calcola gli scaglioni IRPEF 2026 aggiornati alla Legge di Bilancio 2026', () => {
  const model = new FinancialModel();

  assert.equal(model.calcolaImposta(28000), 6440);
  assert.equal(model.calcolaImposta(50000), 13700);
  assert.equal(model.calcolaImposta(60000), 18000);
  // L'imposta lorda è pura: la sterilizzazione dei 440€ sopra 200.000€
  // avviene riducendo le detrazioni, non aumentando l'imposta.
  assert.equal(model.calcolaImposta(250000), 99700);
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

  assert.equal(result.results[0].risparmioFiscale, 1036);
  assert.equal(result.results[0].quotaFpConsigliata, 4036);
  assert.equal(result.results[0].quotaPacConsigliata, 0);
  assert.equal(result.results[0].quotaFpBusta, 300);
  assert.equal(result.results[0].quotaFpBonifico, 3736);
  assert.equal(result.results[0].exitFp, 3814);
  assert.equal(result.results[0].exitMix, 3814);
});

test('distingue beneficio fiscale tra versamento FP in busta e bonifico', () => {
  const model = new FinancialModel();
  const args = [
    30000,
    3000,
    450,
    undefined,
    undefined,
    undefined,
    undefined,
    0.02,
    0
  ];

  const quotaMinimaBusta = model._calculateTaxSavings(...args, 300, 'quotaMinimaBusta');
  const tuttoBusta = model._calculateTaxSavings(...args, 300, 'tuttoBusta');
  const tuttoBonifico = model._calculateTaxSavings(...args, 300, 'tuttoBonifico');

  assert.equal(Math.round(quotaMinimaBusta), 777);
  assert.equal(Math.round(tuttoBusta), 960);
  assert.equal(Math.round(tuttoBonifico), 750);
  assert.ok(tuttoBusta > quotaMinimaBusta);
  assert.ok(quotaMinimaBusta > tuttoBonifico);
});

test('ottimizza la ripartizione busta e bonifico della quota FP', () => {
  const model = new FinancialModel();

  const split = model._chooseBestPaymentSplit({
    quotaFp: 3000,
    quotaDatore: 450,
    quotaMinAderente: 300,
    modalitaVersamentoFp: 'ottimizza',
    reddito: 30000,
    contributiInpsPerc: undefined,
    massimaleContributivoInps: undefined,
    sogliaIvsAggiuntivo: undefined,
    aliquotaIvsAggiuntivaPerc: undefined,
    addizionaliPerc: 0.02,
    ulterioriDetrazioni: 0,
    limiteDeduzioneTotale: 5300
  });

  assert.equal(Math.round(split.quotaBusta), 3000);
  assert.equal(Math.round(split.quotaBonifico), 0);
  assert.equal(Math.round(split.risparmio), 960);
});

test('rispetta la modalita forzata extra via bonifico', () => {
  const model = new FinancialModel();

  const split = model._chooseBestPaymentSplit({
    quotaFp: 3000,
    quotaDatore: 450,
    quotaMinAderente: 300,
    modalitaVersamentoFp: 'quotaMinimaBusta',
    reddito: 30000,
    contributiInpsPerc: undefined,
    massimaleContributivoInps: undefined,
    sogliaIvsAggiuntivo: undefined,
    aliquotaIvsAggiuntivaPerc: undefined,
    addizionaliPerc: 0.02,
    ulterioriDetrazioni: 0,
    limiteDeduzioneTotale: 5300
  });

  assert.equal(Math.round(split.quotaBusta), 300);
  assert.equal(Math.round(split.quotaBonifico), 2700);
  assert.equal(Math.round(split.risparmio), 777);
});

test('ottimizza solo la quota FP sopra il minimo aderente', () => {
  const model = new FinancialModel();
  const candidates = model._getPaymentSplitCandidates(3000, 300, 'ottimizza');

  assert.deepEqual(candidates, [
    { quotaBusta: 300, quotaBonifico: 2700 },
    { quotaBusta: 3000, quotaBonifico: 0 }
  ]);
});

test('puo lasciare extra FP via bonifico quando la busta riduce bonus fiscali', () => {
  const model = new FinancialModel();

  const split = model._chooseBestPaymentSplit({
    quotaFp: 3000,
    quotaDatore: 450,
    quotaMinAderente: 300,
    modalitaVersamentoFp: 'ottimizza',
    reddito: 8000,
    contributiInpsPerc: undefined,
    massimaleContributivoInps: undefined,
    sogliaIvsAggiuntivo: undefined,
    aliquotaIvsAggiuntivaPerc: undefined,
    addizionaliPerc: 0.02,
    ulterioriDetrazioni: 0,
    limiteDeduzioneTotale: 5300
  });

  assert.equal(Math.round(split.quotaBusta), 300);
  assert.equal(Math.round(split.quotaBonifico), 2700);
  assert.equal(Math.round(split.extraRisparmioVersamento), -192);
});

test('le ulteriori detrazioni riducono il beneficio fiscale se manca capienza', () => {
  const model = new FinancialModel();

  assert.equal(Math.round(model._calculateTaxSavings(12000, 3000, 0)), 551);
  assert.equal(Math.round(model._calculateTaxSavings(12000, 3000, 0, undefined, undefined, undefined, undefined, 0, 500)), 51);
  assert.equal(Math.round(model._calculateTaxSavings(12000, 3000, 0, undefined, undefined, undefined, undefined, 0, 2000)), 0);
});

test('calcola il bonus cuneo fiscale 2025-2026 sul reddito complessivo', () => {
  const model = new FinancialModel();

  assert.equal(Math.round(model._calculateBonusCuneoFiscale(8000)), 568);
  assert.equal(Math.round(model._calculateBonusCuneoFiscale(12000)), 636);
  assert.equal(Math.round(model._calculateBonusCuneoFiscale(18000)), 864);
  assert.equal(Math.round(model._calculateBonusCuneoFiscale(30000)), 1000);
  assert.equal(Math.round(model._calculateBonusCuneoFiscale(36000)), 500);
  assert.equal(model._calculateBonusCuneoFiscale(41000), 0);
});

test('la quota FP in busta incide sul bonus cuneo, quella via bonifico no', () => {
  const model = new FinancialModel();
  const args = [40700, 1000, 0, 0, 1000000, 1000000, 0, 0, 0, 0];

  assert.equal(model._calculateBonusCuneoFiscale(40700), 0);
  assert.equal(model._calculateBonusCuneoFiscale(39700), 37.5);
  assert.equal(Math.round(model._calculateTaxSavings(...args, 'tuttoBonifico')), 330);
  assert.equal(Math.round(model._calculateTaxSavings(...args, 'tuttoBusta')), 454);
});

test('le detrazioni abbattono solo l IRPEF, addizionali dovute solo con IRPEF positiva', () => {
  // Detrazioni capienti: addizionali dovute per intero.
  assert.deepEqual(
    calculateNetTaxDue({ impostaLorda: 2089, addizionali: 182, detrazioni: 1955 }),
    { irpefNetta: 134, addizionaliDovute: 182, impostaNetta: 316 }
  );
  // Detrazioni che azzerano l'IRPEF: addizionali non dovute.
  assert.deepEqual(
    calculateNetTaxDue({ impostaLorda: 1880, addizionali: 163, detrazioni: 1955 }),
    { irpefNetta: 0, addizionaliDovute: 0, impostaNetta: 0 }
  );
  // L'eccedenza di detrazioni non compensa mai le addizionali.
  assert.deepEqual(
    calculateNetTaxDue({ impostaLorda: 1900, addizionali: 163, detrazioni: 1950 }),
    { irpefNetta: 0, addizionaliDovute: 0, impostaNetta: 0 }
  );
});

test('calcola ex Bonus Renzi con soglie e capienza', () => {
  const model = new FinancialModel();

  assert.equal(model._calculateTrattamentoIntegrativo(12000, 1000, 900, 0), 1200);
  assert.equal(model._calculateTrattamentoIntegrativo(12000, 900, 1000, 0), 0);
  // Capienza L. 207/2024: lorda confrontata con detrazione − 75€.
  assert.equal(model._calculateTrattamentoIntegrativo(8300, 1900, 1955, 0), 1200);
  assert.equal(model._calculateTrattamentoIntegrativo(8100, 1870, 1955, 0), 0);
  assert.equal(model._calculateTrattamentoIntegrativo(20000, 3000, 2600, 800), 400);
  assert.equal(model._calculateTrattamentoIntegrativo(29000, 5000, 2000, 0), 0);
});

test('calcola imponibile IRPEF con massimale INPS e IVS aggiuntivo', () => {
  const model = new FinancialModel();

  assert.equal(Math.round(model._calculateIrpefTaxableIncome({
    reddito: 150000,
    contributiInpsPerc: 0.0919,
    massimaleContributivoInps: 120607,
    sogliaIvsAggiuntivo: 55448,
    aliquotaIvsAggiuntivaPerc: 0.01
  })), 138265);
});

test('usa il rendimento PAC come rendimento netto senza costi o tasse aggiuntive', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    investimento: 3000,
    rendimentoAnnualePacPerc: 0.08
  });

  assert.equal(result.results[0].exitPac, 3000);
  assert.equal(result.results[0].exitPac, 3000);
});

test('la modalita investimento confronta le strategie a parita di versamento', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    addizionaliPerc: 0.02,
    modalitaConfronto: 'sacrificioNetto'
  });

  // Tutte le serie versano il target: il beneficio fiscale resta in tasca.
  assert.equal(result.results[0].risparmioFiscale, 777);
  assert.equal(result.results[0].quotaFpConsigliata, 3000);
  assert.equal(result.results[0].quotaPacConsigliata, 0);
  assert.equal(result.results[0].exitPac, 3000);
  assert.equal(result.results[0].exitMix, 2933);
});

test('spesa e investimento sono modalita inverse sull allocazione ottimale', () => {
  const model = new FinancialModel();
  const common = {
    ...baseConfig,
    durata: 1,
    addizionaliPerc: 0.02
  };
  const wallet = model.calculateResults({
    ...common,
    investimento: 3000,
    modalitaConfronto: 'budgetLordo'
  });
  const walletMix = wallet.strategies.mix[0];
  const targetInvestment = walletMix.quotaFpConsigliata + walletMix.quotaPacConsigliata;
  const investment = model.calculateResults({
    ...common,
    investimento: targetInvestment,
    modalitaConfronto: 'sacrificioNetto'
  });
  const investmentMix = investment.strategies.mix[0];
  const actualInvestment = investmentMix.quotaFpConsigliata + investmentMix.quotaPacConsigliata;
  const actualExpense = actualInvestment - investmentMix.risparmioFiscale;

  assert.ok(targetInvestment >= 3000);
  assert.ok(Math.abs(actualInvestment - targetInvestment) <= 1);
  assert.ok(Math.abs(actualExpense - 3000) <= 1);
});

test('applica variazioni periodiche a reddito e investimento', () => {
  const model = new FinancialModel();

  assert.equal(model._applyPeriodicVariation(30000, 1, 'percentuale', 3, 5), 30000);
  assert.equal(model._applyPeriodicVariation(30000, 4, 'percentuale', 3, 5), 31500);
  assert.equal(model._applyPeriodicVariation(3000, 7, 'euro', 3, 250), 3500);

  const result = model.calculateResults({
    ...baseConfig,
    durata: 4,
    addizionaliPerc: 0.02,
    variazioneRedditoTipo: 'percentuale',
    variazioneRedditoFrequenza: 3,
    variazioneRedditoValore: 5
  });

  assert.equal(result.results[0].quotaDatore, 450);
  assert.equal(result.results[0].quotaEntroMinima, 300);
  assert.equal(result.results[3].quotaDatore, 473);
  assert.equal(result.results[3].quotaEntroMinima, 315);
});

test('usa una base contributiva FP alternativa e variabile', () => {
  const model = new FinancialModel();

  assert.equal(model._resolveContributionBase({
    redditoAnno: 30000,
    anno: 4,
    baseContributivaFpTipo: 'minimoRetributivo',
    baseContributivaFp: 20000,
    variazioneBaseContributivaTipo: 'percentuale',
    variazioneBaseContributivaFrequenza: 3,
    variazioneBaseContributivaValore: 10
  }), 22000);

  const result = model.calculateResults({
    ...baseConfig,
    durata: 4,
    baseContributivaFpTipo: 'minimoRetributivo',
    baseContributivaFp: 20000,
    variazioneBaseContributivaTipo: 'percentuale',
    variazioneBaseContributivaFrequenza: 3,
    variazioneBaseContributivaValore: 10
  });

  assert.equal(result.quotaDatoreFp, 300);
  assert.equal(result.results[0].quotaDatore, 300);
  assert.equal(result.results[0].quotaEntroMinima, 200);
  assert.equal(result.results[3].quotaDatore, 330);
  assert.equal(result.results[3].quotaEntroMinima, 220);
});

test('puo usare basi diverse per quota aderente e contributo datore', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    baseContributivaFpTipo: 'minimoRetributivo',
    baseContributivaFp: 20000,
    baseDatoreFpTipo: 'ral'
  });

  assert.equal(result.quotaDatoreFp, 450);
  assert.equal(result.results[0].quotaEntroMinima, 200);
  assert.equal(result.results[0].quotaDatore, 450);
});

test('applica la variazione base anche quando solo il datore usa il minimo retributivo', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 4,
    baseContributivaFpTipo: 'ral',
    baseDatoreFpTipo: 'minimoRetributivo',
    baseDatoreFp: 20000,
    variazioneBaseContributivaTipo: 'percentuale',
    variazioneBaseContributivaFrequenza: 3,
    variazioneBaseContributivaValore: 10
  });

  assert.equal(result.results[0].quotaEntroMinima, 300);
  assert.equal(result.results[0].quotaDatore, 300);
  assert.equal(result.results[3].quotaEntroMinima, 300);
  assert.equal(result.results[3].quotaDatore, 330);
});

test('premi e bonus aumentano il reddito fiscale ma non la base FP su RAL', () => {
  const model = new FinancialModel();
  const baseResult = model.calculateResults({
    ...baseConfig,
    durata: 1,
    addizionaliPerc: 0.02
  });
  const bonusResult = model.calculateResults({
    ...baseConfig,
    durata: 1,
    premiStraordinari: 5000,
    addizionaliPerc: 0.02
  });

  assert.equal(bonusResult.quotaDatoreFp, baseResult.quotaDatoreFp);
  assert.equal(bonusResult.results[0].quotaDatore, baseResult.results[0].quotaDatore);
  assert.equal(bonusResult.results[0].quotaEntroMinima, baseResult.results[0].quotaEntroMinima);
  assert.ok(bonusResult.results[0].risparmioFiscale > baseResult.results[0].risparmioFiscale);
});

test('manda sempre nel PAC la quota oltre deduzione', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    investimento: 8000,
    addizionaliPerc: 0.02
  });

  assert.equal(result.results[0].quotaEntroDeduzione, 4850);
  assert.equal(result.results[0].quotaExtraDeduzione, 4390);
  assert.equal(result.results[0].quotaFpConsigliata, 4850);
  assert.equal(result.results[0].quotaPacConsigliata, 4390);
  assert.equal(result.results[0].scelta, 'MIX');
});

test('ammette FP non deducibile solo per raggiungere la quota minima e ottenere il datore', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    reddito: 100000,
    investimento: 10000,
    quotaMinAderentePerc: 0.02,
    quotaDatoreFpPerc: 0.04,
    ulterioriDetrazioni: 100000,
    rendimentoAnnualeFpPerc: 0,
    rendimentoAnnualePacPerc: 0
  });

  const row = result.strategies.mix[0];
  assert.equal(row.quotaFpConsigliata, 2000);
  assert.equal(row.quotaFpDeducibile, 1300);
  assert.equal(row.quotaFpNonDeducibile, 700);
  assert.equal(row.quotaDatore, 4000);
  assert.equal(row.quotaDatoreDeducibile, 4000);
  assert.equal(row.quotaPacConsigliata, 8000);
  assert.equal(row.quotaPacOltreLimite, 8000);
  assert.equal(row.risparmioFiscale, 0);
  assert.equal(row.exitMix, 13205);
  assert.equal(row._state.contributiFP, 6000);
  assert.equal(row._state.contributiFpDeducibili, 5300);
  assert.equal(row._state.contributiFpNonDeducibili, 700);
});

test('il benchmark FP a deduzione + PAC riempie il plafond e destina il resto al PAC', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    investimento: 8000
  });
  const fpFirst = result.strategies.fp[0];

  assert.equal(fpFirst.scelta, 'FP');
  // FP dedotto al massimo consentito (5.300 − datore), niente non dedotto.
  assert.equal(fpFirst.quotaFpNonDeducibile, 0);
  assert.equal(fpFirst.quotaFpConsigliata, fpFirst.quotaFpDeducibile);
  assert.ok(fpFirst.quotaPacConsigliata > 0);
  // Parità di spesa: FP + PAC − beneficio = budget.
  assert.equal(fpFirst.quotaFpConsigliata + fpFirst.quotaPacConsigliata - fpFirst.risparmioFiscale, 8000);
});

test('l ottimale puo versare oltre il plafond come FP non dedotto quando rende piu del PAC', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 10,
    investimento: 8000,
    rendimentoAnnualeFpPerc: 0.05,
    rendimentoAnnualePacPerc: 0.02
  });
  const mix = result.strategies.mix[0];

  // Con FP che rende più del PAC l'eccedenza va nel fondo, non dedotta.
  assert.ok(mix.quotaFpNonDeducibile > 0);
  assert.equal(mix.quotaPacConsigliata, 0);
  assert.equal(mix.quotaFpConsigliata, mix.quotaFpDeducibile + mix.quotaFpNonDeducibile);
});

test('altri redditi e premi crescenti alzano il reddito fiscale e il risparmio', () => {
  const model = new FinancialModel();
  const base = model.calculateResults({ ...baseConfig, durata: 4, addizionaliPerc: 0.02 });
  const conAltri = model.calculateResults({
    ...baseConfig,
    durata: 4,
    addizionaliPerc: 0.02,
    altriRedditi: 20000
  });
  const conPremiCrescenti = model.calculateResults({
    ...baseConfig,
    durata: 4,
    addizionaliPerc: 0.02,
    premiStraordinari: 2000,
    variazionePremiTipo: 'percentuale',
    variazionePremiFrequenza: 1,
    variazionePremiValore: 50
  });

  // Più imponibile IRPEF -> aliquota marginale più alta -> risparmio maggiore.
  assert.ok(conAltri.results[0].risparmioFiscale > base.results[0].risparmioFiscale);
  // I premi crescenti aumentano il beneficio negli anni successivi.
  assert.ok(conPremiCrescenti.results[3].risparmioFiscale >= conPremiCrescenti.results[0].risparmioFiscale);
  assert.ok(conPremiCrescenti.results[0].risparmioFiscale >= base.results[0].risparmioFiscale);
});

test('l allocazione ottimale puo dividere la quota deducibile prima del FP pieno', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    addizionaliPerc: 0.02
  });

  // Con l'aliquota di uscita valutata a scadenza il FP pieno arriva prima.
  assert.equal(result.breakeven, 19);
  assert.equal(result.results[0].scelta, 'MIX');
  assert.equal(result.results[17].scelta, 'MIX');
  assert.equal(result.results[18].scelta, 'FP');
  assert.equal(result.results.at(-1).scelta, 'FP');
  assert.ok(result.results.at(-1).exitMix > result.results.at(-1).exitPac);
});

test('l ottimizzatore valuta l imposta di uscita FP all orizzonte, non all anno corrente', () => {
  const model = new FinancialModel();
  // Condizioni dell'anno 19 su 30: montante proiettato su 12 anni residui.
  const inputs = {
    netBudget: 3000,
    quotaMinAderente: 300,
    quotaDatorePotenziale: 450,
    reddito: 30000,
    addizionaliPerc: 0.02,
    modalitaVersamentoFp: 'quotaMinimaBusta',
    rFP: 0.04,
    rPAC: 0.06,
    anniResidui: 12
  };

  // Aliquota "se esco oggi" (13.8%): il margine resta al PAC.
  const oggi = model._optimizeAllocation({ ...inputs, tassazioneFpScadenza: 0.138 });
  assert.equal(Math.round(oggi.quotaFp), 300);

  // Aliquota a scadenza (10.5%, 30 anni di partecipazione): FP pieno.
  const scadenza = model._optimizeAllocation({ ...inputs, tassazioneFpScadenza: 0.105 });
  assert.ok(scadenza.quotaFp > 4000);

  // A parità di allocazione, la differenza di valore è esattamente
  // contributo deducibile × delta aliquota.
  assert.ok(scadenza.totaleNetto > oggi.totaleNetto);
});

test('l allocazione ottimale non e inferiore agli scenari puri sull exit finale', () => {
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

    assert.ok(finalRow.exitMix >= finalRow.exitFp - 1);
    assert.ok(finalRow.exitMix >= finalRow.exitPac - 1);
  }
});

test('converte i risultati in CSV con intestazione coerente', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({ ...baseConfig, durata: 1 });

  assert.equal(
    model.convertToCSV(result.results),
    'Anno,Entro Min,Extra Min,Entro Ded,Extra Ded,Aderente,Datore,Risparmio,FP Cons,FP Deducibile,FP Non Deducibile,Datore Deducibile,PAC Cons,PAC Oltre Limite,FP Busta,FP Bonifico,Diff Busta,Scelta,Exit FP,Exit PAC,Exit Mix\r\n' +
      '1,300,3632,3932,0,3932,450,932,3932,3932,0,450,0,0,300,3632,267,FP,3725,3000,3725\r\n'
  );
});

test('esploratore annuale: fiscalità dell\'anno dal model', () => {
  const model = new FinancialModel();
  const config = {
    ...baseConfig,
    contributiInpsPerc: 0.0919,
    addizionaliPerc: 0.02
  };
  const { results } = model.calculateResults(config);

  const anno1 = model.buildAnnualExplorerData(config, results, 1);
  assert.equal(Math.round(anno1.imponibileIrpef), 27243);
  assert.equal(Math.round(anno1.contributiInps), 2757);
  assert.equal(Math.round(anno1.irpefLorda), 6266);
  assert.equal(Math.round(anno1.addizionali), 545);
  assert.equal(anno1.aliquotaMarginale, 23);
  assert.equal(Math.round(anno1.detrazioneLavoro), 2044);
  assert.equal(anno1.ulterioriDetrazioni, 0);
  assert.equal(Math.round(anno1.impostaNetta), 4766);
  assert.equal(anno1.trattamentoIntegrativo, 0);
  assert.equal(anno1.bonusCuneo, 1000);
  assert.equal(Math.round(anno1.capienzaResidua), 4550);
  assert.equal(Math.round(anno1.limiteDisponibileAderente), 4850);
  assert.equal(anno1.quotaEntroMinima, 300);
  assert.equal(anno1.quotaExtraMinima, 0);
  assert.equal(anno1.quotaExtraDeduzione, 2802);
  assert.equal(anno1.diffBustaBonifico, 0);
  assert.equal(Math.round(anno1.spesaEffettivaAnno), 3000);
  assert.equal(Math.round(anno1.investimentoPersonaleAnno), 3102);
  assert.equal(Math.round(anno1.beneficioInvestitoAnno), 102);
  assert.equal(Math.round(anno1.totaleMessoAlLavoroAnno), 3552);
  assert.equal(Math.round(anno1.versatoFp), 750);
  assert.equal(anno1.tassoUscitaFp, 0.15);
  assert.equal(anno1.anniPartecipazione, 1);
  assert.equal(Math.round(anno1.montanteFp), 750);
  assert.equal(Math.round(anno1.montantePac), 2802);
  assert.equal(Math.round(anno1.taxComparison.saving), Math.round(anno1.risparmioBaselineBusta));
  assert.equal(
    Math.round(anno1.montanteFp + anno1.montantePac - anno1.impostaUscitaFp - anno1.impostaUscitaPac + anno1.risparmioInExit),
    results[0].exitMix
  );

  // Dopo 15 anni di partecipazione l'aliquota di uscita FP scende.
  const anno23 = model.buildAnnualExplorerData(config, results, 23);
  assert.equal(anno23.tassoUscitaFp, 0.126);
  assert.equal(Math.round(anno23.versatoFp), 35930);
  assert.ok(anno23.montanteFp > anno23.versatoFp);
  assert.ok(anno23.rendimentoFpAnno + anno23.rendimentoPacAnno > 0);
});

test('esploratore annuale: variazioni, riscatto e PAC lordo', () => {
  const model = new FinancialModel();
  const config = {
    ...baseConfig,
    contributiInpsPerc: 0.0919,
    addizionaliPerc: 0.02,
    variazioneRedditoTipo: 'percentuale',
    variazioneRedditoFrequenza: 1,
    variazioneRedditoValore: 2,
    riscattoAnticipato: true,
    rendimentoPacMode: 'lordo',
    quotaAgevolataPacPerc: 0.3
  };
  const { results } = model.calculateResults(config);
  const anno15 = model.buildAnnualExplorerData(config, results, 15);

  assert.equal(Math.round(anno15.redditoAnno), 39584);
  assert.equal(Math.round(anno15.imponibileIrpef), 35947);
  // Riscatto anticipato: aliquota fissa al 23%.
  assert.equal(anno15.tassoUscitaFp, 0.23);
  assert.equal(anno15.pacTassatoInUscita, true);
  assert.equal(Number(anno15.aliquotaPacUscita.toFixed(2)), 21.95);
});
