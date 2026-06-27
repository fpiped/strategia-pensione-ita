import { COMPARTI_FP, ETF_PRESETS } from '../constants/financial-constants.js';

export function resolveRendimentoFp(compartoId, fallback = 0) {
  const comparto = COMPARTI_FP[compartoId];
  return comparto ? comparto.rendimentoDefault : fallback;
}

export function resolveRendimentoPac(etfId, fallback = 0) {
  const etf = ETF_PRESETS[etfId];
  return etf ? etf.rendimentoDefault : fallback;
}

export function buildInputWarnings(config) {
  const warnings = [];
  const baseContributivaFp = config.baseContributivaFpTipo !== 'ral' && config.baseContributivaFp > 0
    ? config.baseContributivaFp
    : config.reddito;
  const investimentoMinimoDatore = baseContributivaFp * config.quotaMinAderentePerc;

  if (config.investimento > config.reddito * 0.5 && config.reddito > 0) {
    warnings.push('Investimento annuo molto alto rispetto al reddito: verifica che sia sostenibile e netto di altre esigenze.');
  }

  if (config.variazioneRedditoFrequenza > 0 && config.variazioneRedditoValore < 0) {
    warnings.push('La variazione reddito è negativa: stai simulando una riduzione periodica della RAL.');
  }

  if (config.variazioneInvestimentoFrequenza > 0 && config.variazioneInvestimentoValore < 0) {
    warnings.push('La variazione investimento è negativa: stai simulando una riduzione periodica del budget annuo.');
  }

  if (config.baseContributivaFpTipo !== 'ral' && config.baseContributivaFp <= 0) {
    warnings.push('Hai selezionato una base contributi FP alternativa ma non hai inserito un valore annuo: il calcolo usa la RAL.');
  }

  if (config.baseContributivaFpTipo !== 'ral' && config.baseContributivaFp > config.reddito) {
    warnings.push('La base contributi FP alternativa non può superare la RAL: il calcolo la limita alla RAL.');
  }

  if (config.variazioneBaseContributivaFrequenza > 0 && config.variazioneBaseContributivaValore < 0) {
    warnings.push('La variazione base contributi FP è negativa: stai simulando una riduzione periodica della base per quota minima e contributo datore.');
  }

  if (config.contributiInpsPerc < 0.0919 || config.contributiInpsPerc > 0.0949) {
    warnings.push('Aliquota INPS fuori dal range tipico 9,19%-9,49%: va bene se stai usando il dato reale della busta paga.');
  }

  if (config.massimaleContributivoInps > 0 && config.sogliaIvsAggiuntivo > config.massimaleContributivoInps) {
    warnings.push('La soglia IVS aggiuntivo è superiore al massimale INPS: in questo scenario l’IVS aggiuntivo non verrà applicato.');
  }

  if (
    config.investimento < investimentoMinimoDatore &&
    (config.quotaDatoreFpPerc > 0 || config.contributoDatoreFisso > 0)
  ) {
    warnings.push('Con questi input non raggiungi la quota minima per ottenere il contributo del datore.');
  }

  if (config.rendimentoAnnualePacPerc < config.rendimentoAnnualeFpPerc) {
    warnings.push('Il rendimento PAC ipotizzato è più basso del rendimento FP: in questo scenario il confronto perde senso, perché il PAC non ha un vantaggio di rendimento atteso.');
  }

  if (config.rendimentoAnnualePacPerc - config.rendimentoAnnualeFpPerc >= 0.06) {
    warnings.push('Il PAC ha un rendimento ipotizzato molto più alto del FP: il mix consigliato sarà particolarmente sensibile a questa scelta.');
  }

  if (config.addizionaliPerc > 0.04) {
    warnings.push('Addizionali sopra il 4%: controlla che la percentuale inserita includa solo regionale e comunale.');
  }

  if (config.ulterioriDetrazioni > 3000) {
    warnings.push('Ulteriori detrazioni elevate possono ridurre molto la capienza fiscale e quindi il beneficio della deduzione.');
  }

  if (config.trattamentoIntegrativoAttivo && config.trattamentoIntegrativoSogliaMax <= config.trattamentoIntegrativoSogliaMin) {
    warnings.push('Le soglie del trattamento integrativo non sono coerenti: la soglia massima deve essere maggiore della minima.');
  }

  if (config.modalitaVersamentoFp === 'tuttoBonifico') {
    warnings.push('Con versamento FP tutto via bonifico il modello non attribuisce effetti aggiuntivi su detrazioni lavoro dipendente o trattamento integrativo.');
  }

  if (config.primaOccupazionePost2006 && config.plafondExtraPrimaOccupazione <= 0) {
    warnings.push('Prima occupazione post 2006 attiva ma plafond extra residuo pari a zero: il limite deducibile resta quello ordinario.');
  }

  if (config.primaOccupazionePost2006 && config.anniResiduiMaggiorazione <= 0) {
    warnings.push('Prima occupazione post 2006 attiva ma anni residui maggiorazione pari a zero: il recupero extra non viene applicato.');
  }

  return warnings;
}
