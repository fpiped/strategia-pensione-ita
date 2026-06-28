import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';

export function applyPeriodicVariation(baseValue, year, type = 'percentuale', frequency = 0, value = 0) {
  const safeBase = Math.max(baseValue, 0);
  const safeFrequency = Math.floor(frequency);
  const safeValue = Number.isFinite(value) ? value : 0;

  if (safeFrequency <= 0 || safeValue === 0 || year <= 1) {
    return safeBase;
  }

  const increments = Math.floor((year - 1) / safeFrequency);
  if (increments <= 0) {
    return safeBase;
  }

  if (type === 'euro') {
    return Math.max(safeBase + (safeValue * increments), 0);
  }

  return Math.max(safeBase * Math.pow(1 + safeValue / 100, increments), 0);
}

export function resolveContributionBase({
  redditoAnno,
  anno,
  baseContributivaFpTipo = 'ral',
  baseContributivaFp = 0,
  variazioneBaseContributivaTipo = 'percentuale',
  variazioneBaseContributivaFrequenza = 0,
  variazioneBaseContributivaValore = 0
}) {
  if (baseContributivaFpTipo === 'ral' || baseContributivaFp <= 0) {
    return Math.max(redditoAnno, 0);
  }

  const baseAlternativa = applyPeriodicVariation(
    baseContributivaFp,
    anno,
    variazioneBaseContributivaTipo,
    variazioneBaseContributivaFrequenza,
    variazioneBaseContributivaValore
  );
  return baseAlternativa;
}

export function resolveEmployerContributionBase({
  redditoAnno,
  anno,
  baseQuotaAnno,
  baseDatoreFpTipo = 'same',
  baseDatoreFp = 0,
  variazioneBaseContributivaTipo = 'percentuale',
  variazioneBaseContributivaFrequenza = 0,
  variazioneBaseContributivaValore = 0
}) {
  if (baseDatoreFpTipo === 'same') {
    return Math.max(baseQuotaAnno, 0);
  }

  return resolveContributionBase({
    redditoAnno,
    anno,
    baseContributivaFpTipo: baseDatoreFpTipo,
    baseContributivaFp: baseDatoreFp,
    variazioneBaseContributivaTipo,
    variazioneBaseContributivaFrequenza,
    variazioneBaseContributivaValore
  });
}

export function getInitialEmployerContribution({
  reddito,
  investimento,
  quotaDatoreFpPerc,
  contributoDatoreFisso = 0,
  quotaMinAderentePerc,
  baseContributivaFpTipo = 'ral',
  baseContributivaFp = 0,
  baseDatoreFpTipo = 'same',
  baseDatoreFp = 0
}) {
  const baseContributiva = resolveContributionBase({
    redditoAnno: reddito,
    anno: 1,
    baseContributivaFpTipo,
    baseContributivaFp
  });
  const baseDatore = resolveEmployerContributionBase({
    redditoAnno: reddito,
    anno: 1,
    baseQuotaAnno: baseContributiva,
    baseDatoreFpTipo,
    baseDatoreFp
  });
  const quotaMinAderente = baseContributiva * quotaMinAderentePerc;
  const quotaDatorePotenziale = calculateEmployerContribution(
    baseDatore,
    quotaDatoreFpPerc,
    contributoDatoreFisso
  );
  return investimento >= quotaMinAderente ? Math.round(quotaDatorePotenziale) : 0;
}

export function calculateEmployerContribution(baseContributiva, quotaDatoreFpPerc, contributoDatoreFisso = 0) {
  return Math.max(baseContributiva * quotaDatoreFpPerc, 0) + Math.max(contributoDatoreFisso, 0);
}

export function createFirstEmploymentState({ enabled = false, extraRemaining = 0, yearsRemaining = 0 } = {}) {
  return {
    enabled: Boolean(enabled),
    extraRemaining: Math.max(extraRemaining, 0),
    yearsRemaining: Math.max(Math.floor(yearsRemaining), 0)
  };
}

export function getTotalDeductionLimit(firstEmployment = {}) {
  const ordinaryLimit = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP;
  if (!firstEmployment.enabled || firstEmployment.yearsRemaining <= 0 || firstEmployment.extraRemaining <= 0) {
    return ordinaryLimit;
  }

  return ordinaryLimit + Math.min(
    firstEmployment.extraRemaining,
    FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNUA
  );
}

export function getAvailableDeductionLimit(firstEmployment, quotaDatore = 0) {
  return Math.max(getTotalDeductionLimit(firstEmployment) - quotaDatore, 0);
}

export function consumeFirstEmploymentAllowance(firstEmployment, quotaFp, quotaDatore) {
  if (!firstEmployment.enabled || firstEmployment.yearsRemaining <= 0) return;

  const extraUsed = Math.min(
    Math.max(quotaFp + quotaDatore - FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP, 0),
    FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNUA,
    firstEmployment.extraRemaining
  );

  firstEmployment.extraRemaining = Math.max(firstEmployment.extraRemaining - extraUsed, 0);
  firstEmployment.yearsRemaining = Math.max(firstEmployment.yearsRemaining - 1, 0);
}

export function splitBudget(budget, quotaMinAderente, quotaDatorePotenziale, firstEmployment) {
  if (budget <= 0) {
    return { quotaDeducibile: 0, quotaExtraPac: 0, quotaDatore: 0 };
  }

  const quotaDatore = budget >= quotaMinAderente ? quotaDatorePotenziale : 0;
  const limiteDeduzione = getAvailableDeductionLimit(firstEmployment, quotaDatore);
  const quotaDeducibile = Math.min(budget, limiteDeduzione);

  return {
    quotaDeducibile,
    quotaExtraPac: Math.max(budget - quotaDeducibile, 0),
    quotaDatore: quotaDeducibile >= quotaMinAderente ? quotaDatore : 0
  };
}
