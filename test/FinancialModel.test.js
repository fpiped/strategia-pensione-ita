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
  rendimentoAnnualePacPerc: 0.06,
  reinvestiRisparmio: true,
  modalitaCumulativa: true,
  riscattoAnticipato: false
};

test('calcola lo scenario cumulativo predefinito', () => {
  const model = new FinancialModel();
  const result = model.calculateResults(baseConfig);

  assert.equal(result.results.length, 30);
  assert.equal(result.breakeven, 26);
  assert.equal(result.quotaDatoreFp, 450);
  assert.equal(result.risparmioImposta, 6821);

  assert.deepEqual(result.results[0], {
    anno: 1,
    quotaEntroMinima: 300,
    quotaExtraMinima: 2700,
    quotaEntroDeduzione: 3000,
    quotaExtraDeduzione: 0,
    quotaAderente: 3000,
    quotaDatore: 450,
    risparmioFiscale: 96,
    quotaFpConsigliata: 300,
    quotaPacConsigliata: 2700,
    quotaFpBusta: 300,
    quotaFpBonifico: 0,
    diffBustaBonifico: 0,
    scelta: 'MIX',
    exitFp: 3650,
    exitPac: 3000,
    exitMix: 3434
  });

  assert.deepEqual(result.results.at(-1), {
    anno: 30,
    quotaEntroMinima: 300,
    quotaExtraMinima: 3629,
    quotaEntroDeduzione: 3929,
    quotaExtraDeduzione: 0,
    quotaAderente: 3929,
    quotaDatore: 450,
    risparmioFiscale: 931,
    quotaFpConsigliata: 3929,
    quotaPacConsigliata: 0,
    quotaFpBusta: 300,
    quotaFpBonifico: 3629,
    diffBustaBonifico: 267,
    scelta: 'FP',
    exitFp: 229276,
    exitPac: 237175,
    exitMix: 262053
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
  assert.equal(result.results[0].quotaEntroMinima, 100);
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

  assert.equal(result.results[0].risparmioFiscale, 777);
  assert.equal(result.results[0].quotaFpConsigliata, 3000);
  assert.equal(result.results[0].quotaPacConsigliata, 0);
  assert.equal(result.results[0].quotaFpBusta, 300);
  assert.equal(result.results[0].quotaFpBonifico, 2700);
  assert.equal(result.results[0].exitFp, 3710);
  assert.equal(result.results[0].exitMix, 3710);
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
  assert.equal(Math.round(model._calculateTaxSavings(...args, 'tuttoBonifico')), 350);
  assert.equal(Math.round(model._calculateTaxSavings(...args, 'tuttoBusta')), 474);
});

test('calcola ex Bonus Renzi con soglie e capienza', () => {
  const model = new FinancialModel();

  assert.equal(model._calculateTrattamentoIntegrativo(12000, 1000, 900, 0), 1200);
  assert.equal(model._calculateTrattamentoIntegrativo(12000, 900, 1000, 0), 0);
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

test('la modalita sacrificio netto confronta il PAC con il costo netto del FP', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    addizionaliPerc: 0.02,
    modalitaConfronto: 'sacrificioNetto'
  });

  assert.equal(result.results[0].risparmioFiscale, 777);
  assert.equal(result.results[0].quotaFpConsigliata, 3000);
  assert.equal(result.results[0].quotaPacConsigliata, 0);
  assert.equal(result.results[0].exitPac, 2223);
  assert.equal(result.results[0].exitMix, 2933);
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
  assert.equal(result.results[0].quotaExtraDeduzione, 3150);
  assert.equal(result.results[0].quotaFpConsigliata, 4850);
  assert.equal(result.results[0].quotaPacConsigliata, 3150);
  assert.equal(result.results[0].scelta, 'MIX');
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

  assert.equal(result.breakeven, 25);
  assert.equal(result.results[0].scelta, 'MIX');
  assert.equal(result.results[19].scelta, 'MIX');
  assert.equal(result.results[23].scelta, 'MIX');
  assert.equal(result.results[23].scelta, 'MIX');
  assert.equal(result.results[24].scelta, 'FP');
  assert.equal(result.results.at(-1).scelta, 'FP');
  assert.ok(result.results.at(-1).exitMix > result.results.at(-1).exitPac);
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
    'Anno,Entro Min,Extra Min,Entro Ded,Extra Ded,Aderente,Datore,Risparmio,FP Cons,PAC Cons,FP Busta,FP Bonifico,Diff Busta,Scelta,Exit FP,Exit PAC,Exit Mix\r\n' +
      '1,300,2700,3000,0,3000,450,717,3000,0,300,2700,182,FP,3650,3000,3650\r\n'
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
  assert.equal(Math.round(anno1.capienzaResidua), 4550);
  assert.equal(Math.round(anno1.versatoFp), 750);
  assert.equal(anno1.tassoUscitaFp, 0.15);
  assert.equal(anno1.anniPartecipazione, 1);

  // Dopo 15 anni di partecipazione l'aliquota di uscita FP scende.
  const anno23 = model.buildAnnualExplorerData(config, results, 23);
  assert.equal(anno23.tassoUscitaFp, 0.126);
  assert.equal(Math.round(anno23.versatoFp), 17250);
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
