import assert from 'node:assert/strict';
import test from 'node:test';

import { FinancialModel } from '../js/models/FinancialModel.js';
import { calculateNetTaxDue } from '../js/calculators/tax-calculator.js';
import { applyFpAnnualGrowth, applyPacAnnualGrowth, calculateNetAnnualReturn } from '../js/calculators/investment-growth.js';

const baseConfig = {
  durata: 30,
  reddito: 30000,
  investimento: 3000,
  quotaDatoreFpPerc: 0.015,
  quotaMinAderentePerc: 0.01,
  rendimentoAnnualeFpPerc: 0.04,
  rendimentoAnnualePacPerc: 0.06,
  modalitaCumulativa: true,
  riscattoAnticipato: false
};

test('calcola lo scenario cumulativo predefinito', () => {
  const model = new FinancialModel();
  const result = model.calculateResults(baseConfig);

  assert.equal(result.results.length, 30);
  assert.equal(result.quotaDatoreFp, 450);
  assert.equal(result.risparmioImposta, 11244);
  assert.deepEqual(result.strategies.map((strategy) => strategy.id), [
    'optimized',
    'all-pac',
    'minimum-employer',
    'maximum-fp'
  ]);
  assert.ok(Number.isFinite(result.tir.optimal));

  const first = result.results[0];
  assert.equal(first.investimentoNetto, 3000);
  assert.equal(first.investimentoLordo, 3096);
  assert.equal(first.quotaFpConsigliata, 300);
  assert.equal(first.quotaPacConsigliata, 2796);
  assert.equal(first.risparmioFiscale, 96);
  assert.equal(first.exitOttimale, 3434);

  const last = result.results.at(-1);
  assert.equal(last.investimentoNetto, 3000);
  assert.equal(last.investimentoLordo, 3932);
  assert.equal(last.quotaFpConsigliata, 3932);
  assert.equal(last.quotaPacConsigliata, 0);
  assert.equal(last.quotaFpNonDeducibile, 1);
  assert.equal(last.risparmioFiscale, 932);
  assert.equal(last.exitOttimale, 263714);
  assert.equal(last.scelta, 'FP');
  assert.equal(last._allocation.pacResidualTechnical, false);
  assert.equal(last._allocation.quotaPac, 0);
});

test('ottimizza solo il versamento dell anno 1 e poi ne segue la crescita', () => {
  const model = new FinancialModel();
  const config = { ...baseConfig, modalitaCumulativa: false };
  const result = model.calculateResults(config);

  assert.equal(result.results.length, 30);
  assert.equal(result.results[0].investimentoNetto, 3000);
  assert.equal(result.results[0].scelta, 'MIX');
  assert.equal(result.results[1].investimentoNetto, 0);
  assert.equal(result.results[1].investimentoLordo, 0);
  assert.equal(result.results[1].scelta, 'NESSUNO');
  assert.equal(result.results.at(-1).scelta, 'NESSUNO');
  assert.equal(result.results.at(-1).exitOttimale, 17413);
  assert.ok(result.results.at(-1).exitOttimale > result.results[0].exitOttimale);

  const anno2 = model.buildAnnualExplorerData(config, result.results, 2);
  assert.equal(anno2.investimentoAnno, 0);
  assert.equal(anno2.spesaEffettivaAnno, 0);
  assert.equal(anno2.investimentoPersonaleAnno, 0);
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
  assert.ok(result.results[0].quotaFpConsigliata < 300);
  assert.ok(Math.abs(
    result.results[0].quotaFpConsigliata
      + result.results[0].quotaPacConsigliata
      - result.results[0].risparmioFiscale
      - 100
  ) <= 1);
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

test('evita di attivare un secondo strumento quando il suo costo fisso non conviene', () => {
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
  const explorer = model.buildAnnualExplorerData(config, result.results, 2);

  assert.equal(result.results.at(-1).exitOttimale, 7406);
  assert.equal(explorer.costoFissoFpAnno, 25);
  assert.equal(explorer.costoFissoPacAnno, 0);
  assert.ok(explorer.montanteFp > 0);
  assert.equal(explorer.montantePac, 0);
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
  assert.ok(earlyExit.results[0].exitOttimale < ordinary.results[0].exitOttimale);
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
  assert.ok(conPregresso.results[0].exitOttimale > senzaPregresso.results[0].exitOttimale);
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

test('include l’aliquota manuale piatta nel risparmio fiscale', () => {
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
  assert.equal(result.results[0].exitOttimale, 3814);
});

test('l’ottimizzatore conserva il salto dell’esenzione comunale', () => {
  const model = new FinancialModel();
  const common = {
    ...baseConfig,
    durata: 1,
    reddito: 27000,
    investimento: 3000,
    quotaDatoreFpPerc: 0,
    quotaMinAderentePerc: 0,
    contributiInpsPerc: 0,
    addizionaliPerc: 0.018,
    modalitaVersamentoFp: 'tuttoBonifico'
  };
  const flat = model.calculateResults(common).results[0];
  const withExemption = model.calculateResults({
    ...common,
    localTaxRules: [
      { rate: 0.01, exemption: 0 },
      { rate: 0.008, exemption: 23000 }
    ]
  }).results[0];

  assert.ok(withExemption.risparmioFiscale > flat.risparmioFiscale);
  assert.ok(withExemption.investimentoLordo > flat.investimentoLordo);
});

test('distingue beneficio fiscale tra versamento FP in busta e bonifico', () => {
  const model = new FinancialModel();
  const inputs = {
    reddito: 30000,
    investimento: 3000,
    quotaDatoreFp: 450,
    localTaxRules: [{ rate: 0.02 }],
    quotaMinAderente: 300
  };

  const quotaMinimaBusta = model._calculateTaxSavings({ ...inputs, modalitaVersamentoFp: 'quotaMinimaBusta' });
  const tuttoBusta = model._calculateTaxSavings({ ...inputs, modalitaVersamentoFp: 'tuttoBusta' });
  const tuttoBonifico = model._calculateTaxSavings({ ...inputs, modalitaVersamentoFp: 'tuttoBonifico' });

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
    localTaxRules: [{ rate: 0.02 }],
    detrazioniOrdinarie: 0,
    detrazioniTrattamentoIntegrativo: 0,
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
    localTaxRules: [{ rate: 0.02 }],
    detrazioniOrdinarie: 0,
    detrazioniTrattamentoIntegrativo: 0,
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
    localTaxRules: [{ rate: 0.02 }],
    detrazioniOrdinarie: 0,
    detrazioniTrattamentoIntegrativo: 0,
    limiteDeduzioneTotale: 5300
  });

  assert.equal(Math.round(split.quotaBusta), 300);
  assert.equal(Math.round(split.quotaBonifico), 2700);
  assert.equal(Math.round(split.extraRisparmioVersamento), -192);
});

test('le detrazioni ordinarie riducono il beneficio fiscale se manca capienza', () => {
  const model = new FinancialModel();

  const inputs = { reddito: 12000, investimento: 3000, quotaDatoreFp: 0 };
  assert.equal(Math.round(model._calculateTaxSavings(inputs)), 551);
  assert.equal(Math.round(model._calculateTaxSavings({ ...inputs, detrazioniOrdinarie: 500 })), 51);
  assert.equal(Math.round(model._calculateTaxSavings({ ...inputs, detrazioniOrdinarie: 2000 })), 0);
});

test('solo le detrazioni dedicate modificano il trattamento integrativo dell ottimizzatore', () => {
  const model = new FinancialModel();
  const inputs = {
    reddito: 20000,
    investimento: 1000,
    quotaDatoreFp: 0,
    contributiInpsPerc: 0,
    modalitaVersamentoFp: 'tuttoBusta'
  };
  const ordinarySaving = model._calculateTaxSavings({
    ...inputs,
    detrazioniOrdinarie: 2500
  });
  const treatmentSaving = model._calculateTaxSavings({
    ...inputs,
    detrazioniTrattamentoIntegrativo: 2500
  });

  assert.equal(Math.round(ordinarySaving), -48);
  assert.equal(Math.round(treatmentSaving), 274);
});

test('l’ottimizzatore non trasforma la detrazione cuneo incapiente in rimborso', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    reddito: 25000,
    investimento: 1000,
    quotaDatoreFpPerc: 0,
    quotaMinAderentePerc: 0,
    contributiInpsPerc: 0,
    detrazioniOrdinarie: 3500,
    addizionaliPerc: 0.02,
    modalitaVersamentoFp: 'tuttoBonifico'
  });

  assert.equal(result.results[0].risparmioFiscale, 0);
  assert.equal(result.results[0].investimentoLordo, 1000);
});

test('la quota FP in busta incide sulle misure cuneo, quella via bonifico no', () => {
  const model = new FinancialModel();
  const inputs = {
    reddito: 40700,
    investimento: 1000,
    quotaDatoreFp: 0,
    contributiInpsPerc: 0,
    massimaleContributivoInps: 1000000,
    sogliaIvsAggiuntivo: 1000000,
    aliquotaIvsAggiuntivaPerc: 0
  };

  assert.equal(Math.round(model._calculateTaxSavings({ ...inputs, modalitaVersamentoFp: 'tuttoBonifico' })), 330);
  assert.equal(Math.round(model._calculateTaxSavings({ ...inputs, modalitaVersamentoFp: 'tuttoBusta' })), 454);
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

  const treatment = (redditoComplessivo, impostaLordaLavoro, impostaLordaComplessiva, detrazioniLavoro, detrazioniRilevanti = 0) =>
    model._calculateTrattamentoIntegrativo({
      redditoComplessivo,
      impostaLordaLavoro,
      impostaLordaComplessiva,
      detrazioniLavoro,
      detrazioniRilevanti
    });

  assert.equal(treatment(12000, 1000, 1000, 900), 1200);
  assert.equal(treatment(12000, 900, 900, 1000), 0);
  // Capienza L. 207/2024: lorda confrontata con detrazione − 75€.
  assert.equal(treatment(8300, 1900, 1900, 1955), 1200);
  assert.equal(treatment(8100, 1870, 1870, 1955), 0);
  // Nella fascia 15.000-28.000 conta invece l'imposta lorda complessiva.
  assert.equal(treatment(20000, 1000, 3000, 2600, 800), 400);
  assert.equal(treatment(29000, 5000, 5000, 2000), 0);
});

test('l esploratore non crea capienza da lavoro usando gli altri redditi', () => {
  const model = new FinancialModel();
  const config = {
    ...baseConfig,
    durata: 1,
    reddito: 6000,
    altriRedditi: 6000,
    investimento: 0,
    quotaDatoreFpPerc: 0,
    quotaMinAderentePerc: 0,
    contributiInpsPerc: 0
  };
  const { results } = model.calculateResults(config);
  const explorer = model.buildAnnualExplorerData(config, results, 1);

  assert.equal(explorer.irpefLorda, 2760);
  assert.equal(explorer.irpefLordaLavoro, 1380);
  assert.equal(explorer.trattamentoIntegrativo, 0);
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
    quotaDatoreFpPerc: 0,
    quotaMinAderentePerc: 0,
    detrazioniOrdinarie: 100000,
    rendimentoAnnualeFpPerc: 0,
    rendimentoAnnualePacPerc: 0.08
  });

  assert.equal(result.results[0].quotaFpConsigliata, 0);
  assert.equal(result.results[0].quotaPacConsigliata, 3000);
  assert.equal(result.results[0].exitOttimale, 3000);
});

test('il beneficio fiscale aumenta il lordo senza essere contato due volte', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    addizionaliPerc: 0.02
  });

  // 3.000 € netti finanziano 4.036 € lordi, tutti nel FP. L'exit è il
  // capitale FP + datore al netto dell'imposta, senza sommare ancora 1.036 €.
  assert.equal(result.results[0].investimentoNetto, 3000);
  assert.equal(result.results[0].risparmioFiscale, 1036);
  assert.equal(result.results[0].investimentoLordo, 4036);
  assert.equal(result.results[0].quotaFpConsigliata, 4036);
  assert.equal(result.results[0].quotaPacConsigliata, 0);
  assert.equal(result.results[0].exitOttimale, 3814);
});

test('FP + PAC meno beneficio riconciliano sempre l investimento netto indicato', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 5,
    investimento: 5000,
    variazioneInvestimentoTipo: 'euro',
    variazioneInvestimentoFrequenza: 2,
    variazioneInvestimentoValore: 500,
    addizionaliPerc: 0.02
  });

  result.results.forEach((row, index) => {
    const target = 5000 + (Math.floor(index / 2) * 500);
    const actual = row.quotaFpConsigliata + row.quotaPacConsigliata - row.risparmioFiscale;
    assert.ok(Math.abs(actual - target) <= 1, `anno ${index + 1}: ${actual} != ${target}`);
    assert.ok(Math.abs(row.investimentoLordo - (row.quotaFpConsigliata + row.quotaPacConsigliata)) <= 1);
    assert.equal(row.investimentoNetto, target);
  });
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

test('manda al PAC la quota oltre deduzione quando ha il valore marginale maggiore', () => {
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
  assert.equal(result.results[0].investimentoLordo, 9240);
  assert.equal(result.results[0].risparmioFiscale, 1240);
  assert.equal(result.results[0].scelta, 'MIX');
});

test('manda un piccolo residuo al FP non dedotto quando aprire il PAC costa troppo', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    investimento: 3300,
    contributiInpsPerc: 0.0919,
    addizionaliPerc: 0.02,
    modalitaVersamentoFp: 'ottimizza',
    rendimentoPacMode: 'lordo',
    costiAnnuiPacPerc: 0.002,
    costiFissiPac: 10
  });

  const row = result.results[0];
  assert.equal(row.investimentoLordo, 4891);
  assert.equal(row.quotaFpConsigliata, 4891);
  assert.equal(row.quotaFpDeducibile, 4850);
  assert.equal(row.quotaFpNonDeducibile, 41);
  assert.equal(row.quotaPacConsigliata, 0);
  assert.equal(row.scelta, 'FP');
});

test('mantiene conveniente il PAC con costi realistici quando il residuo è grande', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    investimento: 8000,
    contributiInpsPerc: 0.0919,
    addizionaliPerc: 0.02,
    modalitaVersamentoFp: 'ottimizza',
    rendimentoPacMode: 'lordo',
    costiAnnuiPacPerc: 0.002,
    costiFissiPac: 10
  });

  assert.equal(result.results[0].quotaFpConsigliata, 4850);
  assert.ok(result.results[0].quotaPacConsigliata > 4000);
  assert.equal(result.results[0].scelta, 'MIX');
});

test('cerca euro per euro anche la divisione tra FP non dedotto e PAC', () => {
  const model = new FinancialModel();
  const allocation = model._optimizeAllocation({
    netInvestmentTarget: 1000,
    quotaMinAderente: 0,
    // Il datore occupa il plafond: ogni euro personale nel FP è non dedotto.
    quotaDatorePotenziale: 5300,
    reddito: 30000,
    contributiInpsPerc: 0,
    massimaleContributivoInps: Infinity,
    sogliaIvsAggiuntivo: Infinity,
    aliquotaIvsAggiuntivaPerc: 0,
    addizionaliPerc: 0,
    detrazioniOrdinarie: 100000,
    modalitaVersamentoFp: 'quotaMinimaBusta',
    rFP: 0.05,
    rPAC: 0.06,
    fpGrowthOptions: { mode: 'netto' },
    pacGrowthOptions: {
      mode: 'lordo',
      costiAnnui: 0.002,
      costoFissoAnnuo: 10,
      taxRate: 0.26
    },
    pacExitOptions: { mode: 'lordo', taxRate: 0.26 },
    anniResidui: 10,
    tassazioneFpScadenza: 0.105,
    // Il PAC esistente è sotto la propria base fiscale: attraversare il
    // ritorno in guadagno crea proprio il punto intermedio prima ignorato.
    planState: {
      ...model._createPlanState(),
      montantePAC: 800,
      investimentoPAC: 1500
    }
  });

  assert.equal(allocation.quotaFp, 657);
  assert.equal(allocation.quotaFpDeducibile, 0);
  assert.equal(allocation.quotaFpNonDeducibile, 657);
  assert.equal(allocation.quotaPac, 343);
  assert.equal(allocation.quotaFp + allocation.quotaPac - allocation.risparmio, 1000);
});

test('una piccola quota PAC può convenire se il costo fisso è già sostenuto', () => {
  const model = new FinancialModel();
  const optimizerInputs = {
    netInvestmentTarget: 50,
    quotaMinAderente: 0,
    quotaDatorePotenziale: 0,
    reddito: 30000,
    altriRedditi: 0,
    contributiInpsPerc: 0,
    massimaleContributivoInps: Infinity,
    sogliaIvsAggiuntivo: Infinity,
    aliquotaIvsAggiuntivaPerc: 0,
    addizionaliPerc: 0,
    detrazioniOrdinarie: 100000,
    modalitaVersamentoFp: 'ottimizza',
    rFP: 0.04,
    rPAC: 0.06,
    fpGrowthOptions: { mode: 'netto' },
    pacGrowthOptions: {
      mode: 'lordo',
      costiAnnui: 0.002,
      costoFissoAnnuo: 10,
      taxRate: 0.26
    },
    pacExitOptions: {
      mode: 'lordo',
      costiAnnui: 0.002,
      costoFissoAnnuo: 10,
      taxRate: 0.26
    },
    anniResidui: 30,
    tassazioneFpScadenza: 0.105
  };

  const pacDaAprire = model._optimizeAllocation({
    ...optimizerInputs,
    planState: model._createPlanState()
  });
  const pacGiaAttivo = model._optimizeAllocation({
    ...optimizerInputs,
    planState: {
      ...model._createPlanState(),
      montantePAC: 1000,
      investimentoPAC: 1000
    }
  });

  assert.equal(pacDaAprire.scelta, 'FP');
  assert.equal(pacDaAprire.quotaPac, 0);
  assert.equal(pacGiaAttivo.scelta, 'PAC');
  assert.equal(pacGiaAttivo.quotaPac, 50);
});

test('la proiezione rapida del PAC coincide con la ricorrenza annuale anche quando il conto si esaurisce', () => {
  const model = new FinancialModel();
  const options = {
    mode: 'lordo',
    costiAnnui: 0.002,
    costoFissoAnnuo: 10,
    taxRate: 0.26
  };

  for (const balance of [5, 50, 1000]) {
    for (const years of [1, 10, 30]) {
      let iterative = balance;
      for (let year = 0; year < years; year++) {
        iterative = applyPacAnnualGrowth(iterative, 0, 0.06, options);
      }
      const projected = model._projectPacBalanceWithoutContributions(
        balance,
        0.06,
        years,
        options
      );
      assert.ok(Math.abs(projected - iterative) < 1e-8, `${balance} per ${years} anni`);
    }
  }
});

test('ammette FP non deducibile per raggiungere la quota minima e ottenere il datore', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    reddito: 100000,
    investimento: 10000,
    quotaMinAderentePerc: 0.02,
    quotaDatoreFpPerc: 0.04,
    detrazioniOrdinarie: 100000,
    rendimentoAnnualeFpPerc: 0,
    rendimentoAnnualePacPerc: 0
  });

  const row = result.results[0];
  assert.equal(row.quotaFpConsigliata, 2000);
  assert.equal(row.quotaFpDeducibile, 1300);
  assert.equal(row.quotaFpNonDeducibile, 700);
  assert.equal(row.quotaDatore, 4000);
  assert.equal(row.quotaDatoreDeducibile, 4000);
  assert.equal(row.quotaPacConsigliata, 8000);
  assert.equal(row.quotaPacOltreLimite, 8000);
  assert.equal(row.risparmioFiscale, 0);
  assert.equal(row.exitOttimale, 13205);
  assert.equal(row._state.contributiFP, 6000);
  assert.equal(row._state.contributiFpDeducibili, 5300);
  assert.equal(row._state.contributiFpNonDeducibili, 700);
});

test('espone benchmark confrontabili allo stesso budget personale', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    investimento: 8000
  });
  assert.deepEqual(result.strategies.map((strategy) => strategy.id), [
    'optimized',
    'all-pac',
    'minimum-employer',
    'maximum-fp'
  ]);
  assert.deepEqual(Object.keys(result.tir), ['optimal']);
  assert.equal('breakeven' in result, false);

  for (const strategy of result.strategies) {
    assert.equal(strategy.results.length, 1);
    assert.equal(strategy.totals.budgetNetto, 8000);
    assert.ok(Number.isFinite(strategy.exit));
    assert.ok(strategy._audit.methodologyIds.length > 0);
    for (const row of strategy.results) {
      assert.ok(Math.abs(row._allocation.budgetDifference) < 1e-7);
      assert.ok(row._audit.methodologyIds.includes('budget.net-identity'));
    }
  }

  const allPac = result.strategies.find((strategy) => strategy.id === 'all-pac');
  assert.equal(allPac.totals.fpPersonale, 0);
  assert.equal(allPac.totals.pac, 8000);
  assert.equal(allPac.totals.datore, 0);
  assert.equal(allPac.totals.beneficioFiscale, 0);

  const maximumFp = result.strategies.find((strategy) => strategy.id === 'maximum-fp');
  assert.equal(maximumFp.totals.pac, 0);
  assert.ok(maximumFp.totals.fpPersonale > 8000);
});

test('massimo FP conserva in liquidita un budget non invertibile per un salto fiscale', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    durata: 1,
    reddito: 27650,
    investimento: 100,
    quotaDatoreFpPerc: 0.015,
    quotaMinAderentePerc: 0.01,
    rendimentoAnnualeFpPerc: 0,
    rendimentoAnnualePacPerc: 0
  });
  const maximumFp = result.strategies.find((strategy) => strategy.id === 'maximum-fp');
  const allocation = maximumFp.results[0]._allocation;

  assert.equal(allocation.quotaPac, 0);
  assert.equal(allocation.quotaFp, 108.96);
  assert.ok(allocation.liquiditaResidua > 26);
  assert.ok(Math.abs(
    allocation.quotaFp
      + allocation.liquiditaResidua
      - allocation.beneficioFiscale
      - 100
  ) < 1e-7);
  assert.ok(maximumFp._audit.methodologyIds.includes('budget.fiscal-cliffs'));
  const explorer = model.buildAnnualExplorerData(
    {
      ...baseConfig,
      durata: 1,
      reddito: 27650,
      investimento: 100,
      quotaDatoreFpPerc: 0.015,
      quotaMinAderentePerc: 0.01,
      rendimentoAnnualeFpPerc: 0,
      rendimentoAnnualePacPerc: 0
    },
    maximumFp.results,
    1
  );
  assert.ok(explorer.liquiditaAccumulata > 26);
  assert.equal(
    Math.round(
      explorer.montanteFp
        + explorer.montantePac
        + explorer.liquiditaAccumulata
        - explorer.impostaUscitaFp
        - explorer.impostaUscitaPac
    ),
    maximumFp.exit
  );
});

test('la frontiera annuale usa lo stesso valutatore e presenta i punti critici', () => {
  const model = new FinancialModel();
  const config = { ...baseConfig, durata: 3 };
  const result = model.calculateResults(config);
  const frontier = model.buildAllocationFrontier(config, result.results, 1, 1000);

  assert.equal(frontier.anno, 1);
  assert.equal(frontier.budgetNetto, 3000);
  assert.deepEqual(frontier.criticalPoints.map((point) => point.id), [
    'all-pac',
    'minimum-employer',
    'current-strategy',
    'maximum-fp'
  ]);
  assert.equal(frontier.selected.quotaFp, 1000);
  assert.ok(frontier.selected.feasible);
  assert.ok(Math.abs(
    frontier.selected.quotaFp
      + frontier.selected.quotaPac
      - frontier.selected.beneficioFiscale
      - frontier.budgetNetto
  ) < 1e-7);
  assert.ok(frontier.audit.methodologyIds.includes('allocation.annual-search'));
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
  const mix = result.results[0];

  // Con FP che rende più del PAC l'eccedenza va nel fondo, non dedotta.
  assert.ok(mix.quotaFpNonDeducibile > 0);
  assert.ok(mix.quotaPacConsigliata <= 1);
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

test('l allocazione ottimale puo cambiare ripartizione con l orizzonte residuo', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({
    ...baseConfig,
    addizionaliPerc: 0.02
  });

  assert.equal(result.results[0].scelta, 'MIX');
  assert.ok(result.results.at(-1).quotaFpConsigliata > result.results[0].quotaFpConsigliata);
  assert.ok(result.results.at(-1).quotaPacConsigliata < result.results[0].quotaPacConsigliata);
  assert.ok(result.results.at(-1).exitOttimale > result.results[0].exitOttimale);
});

test('l ottimizzatore valuta l imposta di uscita FP all orizzonte, non all anno corrente', () => {
  const model = new FinancialModel();
  // Condizioni dell'anno 19 su 30: montante proiettato su 12 anni residui.
  const inputs = {
    netInvestmentTarget: 3000,
    quotaMinAderente: 300,
    quotaDatorePotenziale: 450,
    reddito: 30000,
    addizionaliPerc: 0.02,
    modalitaVersamentoFp: 'quotaMinimaBusta',
    rFP: 0.04,
    rPAC: 0.06,
    anniResidui: 12
  };

  // Aliquota "se esco oggi" (13.8%): il margine resta prevalentemente al PAC.
  const oggi = model._optimizeAllocation({ ...inputs, tassazioneFpScadenza: 0.138 });

  // L'aliquota a scadenza (10,5%) rende il FP più interessante, senza
  // alterare il vincolo netto.
  const scadenza = model._optimizeAllocation({ ...inputs, tassazioneFpScadenza: 0.105 });
  assert.ok(scadenza.quotaFp >= oggi.quotaFp);
  assert.ok(Math.abs(scadenza.quotaFp + scadenza.quotaPac - scadenza.risparmio - 3000) < 0.01);
  assert.ok(Math.abs(oggi.quotaFp + oggi.quotaPac - oggi.risparmio - 3000) < 0.01);

  // A parità di allocazione, la differenza di valore è esattamente
  // contributo deducibile × delta aliquota.
  assert.ok(scadenza.totaleNetto > oggi.totaleNetto);
});

test('l allocazione resta ammissibile anche con salti fiscali e configurazioni diverse', () => {
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
    for (const row of result.results) {
      const reconstructedNet = row.quotaFpConsigliata + row.quotaPacConsigliata - row.risparmioFiscale;
      assert.ok(Math.abs(reconstructedNet - row.investimentoNetto) <= 1);
      assert.ok(Number.isFinite(row.exitOttimale));
    }
  }
});

test('converte i risultati in CSV con intestazione coerente', () => {
  const model = new FinancialModel();
  const result = model.calculateResults({ ...baseConfig, durata: 1 });

  assert.equal(
    model.convertToCSV(result.results),
    'Anno,Entro Min,Extra Min,Entro Ded,Extra Ded,Aderente,Datore,Risparmio,FP Cons,FP Deducibile,FP Non Deducibile,Datore Deducibile,PAC Cons,PAC Oltre Limite,FP Busta,FP Bonifico,Diff Busta,Scelta,Investimento Netto,Investimento Lordo,Liquidita Residua,Exit Ottimale\r\n' +
      '1,300,3632,3931,0,3932,450,932,3932,3931,1,450,0,0,300,3632,267,FP,3000,3932,0,3724\r\n'
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
  assert.equal(Math.round(anno1.irpefLordaLavoro), 6266);
  assert.equal(Math.round(anno1.addizionali), 545);
  assert.equal(anno1.aliquotaMarginale, 23);
  assert.equal(Math.round(anno1.detrazioneLavoro), 2044);
  assert.equal(anno1.detrazioniOrdinarie, 0);
  assert.equal(anno1.detrazioniTrattamentoIntegrativo, 0);
  assert.equal(anno1.altreDetrazioniTotali, 0);
  assert.equal(Math.round(anno1.irpefNetta), 3222);
  assert.equal(Math.round(anno1.impostaNetta), 3766);
  assert.equal(anno1.trattamentoIntegrativo, 0);
  assert.equal(anno1.bonusCuneo, 1000);
  assert.equal(anno1.sommaCuneo, 0);
  assert.equal(anno1.detrazioneCuneoNominale, 1000);
  assert.equal(anno1.detrazioneCuneoUsata, 1000);
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
    results[0].exitOttimale
  );

  // Dopo 15 anni di partecipazione l'aliquota di uscita FP scende.
  const anno23 = model.buildAnnualExplorerData(config, results, 23);
  assert.equal(anno23.tassoUscitaFp, 0.126);
  assert.equal(Math.round(anno23.versatoFp), 35925);
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
