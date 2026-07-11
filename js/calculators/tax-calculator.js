import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';
import { CURRENT_FISCAL_RULES } from '../constants/fiscal-rules.js';

const { irpef } = CURRENT_FISCAL_RULES;

export function calculateTaxSavings({
  ...options
}) {
  return calculateTaxComparison(options).saving;
}

/**
 * Restituisce lo stesso confronto usato dal modello per il beneficio fiscale,
 * mantenendo visibili tutte le componenti prima e dopo il versamento FP.
 */
export function calculateTaxComparison({
  reddito,
  investimento,
  quotaDatoreFp,
  contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
  massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
  sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
  aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO,
  addizionaliPerc = 0,
  ulterioriDetrazioni = 0,
  quotaMinAderente = 0,
  modalitaVersamentoFp = 'quotaMinimaBusta',
  quotaBustaFp = null,
  limiteDeduzioneTotale = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP
}) {
  const redditoImponibile = calculateIrpefTaxableIncome({
    reddito,
    contributiInpsPerc,
    massimaleContributivoInps,
    sogliaIvsAggiuntivo,
    aliquotaIvsAggiuntivaPerc
  });
  const limiteDeduzione = Math.max(limiteDeduzioneTotale - quotaDatoreFp, 0);
  const deduzione = Math.min(investimento, limiteDeduzione);
  const splitVersamento = splitFpPayment(investimento, quotaMinAderente, modalitaVersamentoFp);
  const quotaBustaRichiesta = Number.isFinite(quotaBustaFp)
    ? quotaBustaFp
    : splitVersamento.quotaBusta;
  const quotaBusta = Math.min(Math.max(quotaBustaRichiesta, 0), investimento, deduzione);

  const redditoComplessivoCuneo = redditoImponibile;
  const redditoComplessivoCuneoDedotto = Math.max(redditoComplessivoCuneo - quotaBusta, 0);
  const bonusCuneo = calculateBonusCuneoFiscale(redditoComplessivoCuneo);
  const bonusCuneoDedotto = calculateBonusCuneoFiscale(redditoComplessivoCuneoDedotto);

  const impostaLorda = calculateIncomeTax(redditoImponibile);
  const addizionali = redditoImponibile * addizionaliPerc;
  const detrazione = calculateEmployeeDeduction(redditoImponibile);
  const trattamentoIntegrativo = calculateTrattamentoIntegrativo({
    reddito: redditoImponibile,
    impostaLorda,
    detrazioniLavoro: detrazione,
    ulterioriDetrazioni
  });
  const impostaNetta = Math.max(impostaLorda + addizionali - detrazione - ulterioriDetrazioni, 0);
  const costoFiscaleNetto = impostaNetta - trattamentoIntegrativo - bonusCuneo;

  const redditoDedotto = Math.max(redditoImponibile - deduzione, 0);
  const redditoDetrazioniDedotto = Math.max(redditoImponibile - quotaBusta, 0);
  const impostaLordaDedotta = calculateIncomeTax(redditoDedotto);
  const addizionaliDedotte = redditoDedotto * addizionaliPerc;
  const detrazioneDedotta = calculateEmployeeDeduction(redditoDetrazioniDedotto);
  const trattamentoIntegrativoDedotto = calculateTrattamentoIntegrativo({
    reddito: redditoDetrazioniDedotto,
    impostaLorda: calculateIncomeTax(redditoDetrazioniDedotto),
    detrazioniLavoro: detrazioneDedotta,
    ulterioriDetrazioni
  });
  const impostaNettaDedotta = Math.max(
    impostaLordaDedotta + addizionaliDedotte - detrazioneDedotta - ulterioriDetrazioni,
    0
  );
  const costoFiscaleNettoDedotto = impostaNettaDedotta - trattamentoIntegrativoDedotto - bonusCuneoDedotto;

  return {
    deduction: deduzione,
    payrollContribution: quotaBusta,
    before: {
      taxableIncome: redditoImponibile,
      grossIncomeTax: impostaLorda,
      localTaxes: addizionali,
      employeeDeduction: detrazione,
      otherDeductions: ulterioriDetrazioni,
      netTax: impostaNetta,
      supplementaryTreatment: trattamentoIntegrativo,
      taxWedgeBonus: bonusCuneo,
      fiscalCost: costoFiscaleNetto
    },
    after: {
      taxableIncome: redditoDedotto,
      employeeDeductionIncome: redditoDetrazioniDedotto,
      grossIncomeTax: impostaLordaDedotta,
      localTaxes: addizionaliDedotte,
      employeeDeduction: detrazioneDedotta,
      otherDeductions: ulterioriDetrazioni,
      netTax: impostaNettaDedotta,
      supplementaryTreatment: trattamentoIntegrativoDedotto,
      taxWedgeBonus: bonusCuneoDedotto,
      fiscalCost: costoFiscaleNettoDedotto
    },
    saving: costoFiscaleNetto - costoFiscaleNettoDedotto
  };
}

export function splitFpPayment(quotaFp, quotaMinAderente = 0, modalitaVersamentoFp = 'quotaMinimaBusta') {
  const safeQuotaFp = Math.max(quotaFp, 0);
  if (modalitaVersamentoFp === 'tuttoBusta') {
    return { quotaBusta: safeQuotaFp, quotaBonifico: 0 };
  }
  if (modalitaVersamentoFp === 'tuttoBonifico') {
    return { quotaBusta: 0, quotaBonifico: safeQuotaFp };
  }

  const quotaBusta = Math.min(safeQuotaFp, Math.max(quotaMinAderente, 0));
  return {
    quotaBusta,
    quotaBonifico: Math.max(safeQuotaFp - quotaBusta, 0)
  };
}

export function calculateTrattamentoIntegrativo({
  reddito,
  impostaLorda = 0,
  detrazioniLavoro = 0,
  ulterioriDetrazioni = 0
}) {
  const safeReddito = Math.max(reddito, 0);
  const importo = FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_IMPORTO;

  if (
    safeReddito <= FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_PIENA &&
    impostaLorda > detrazioniLavoro
  ) {
    return importo;
  }

  if (
    safeReddito > FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_PIENA &&
    safeReddito <= FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_MAX
  ) {
    const incapienzaDetrazioni = detrazioniLavoro + Math.max(ulterioriDetrazioni, 0) - impostaLorda;
    return Math.max(Math.min(importo, incapienzaDetrazioni), 0);
  }

  return 0;
}

export function calculateBonusCuneoFiscale(redditoComplessivo) {
  const reddito = Math.max(redditoComplessivo, 0);

  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_1) {
    return reddito * FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_1;
  }
  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_2) {
    return reddito * FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_2;
  }
  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_3) {
    return reddito * FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_3;
  }
  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_4) {
    return FINANCIAL_CONSTANTS.BONUS_CUNEO_DETRAZIONE_PIENA;
  }
  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5) {
    return FINANCIAL_CONSTANTS.BONUS_CUNEO_DETRAZIONE_PIENA *
      (FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5 - reddito) /
      (FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5 - FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_4);
  }

  return 0;
}

export function calculateIrpefTaxableIncome({
  reddito,
  contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
  massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
  sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
  aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO
}) {
  const safeReddito = Math.max(reddito, 0);
  const massimale = massimaleContributivoInps > 0 ? massimaleContributivoInps : safeReddito;
  const baseContributivaInps = Math.min(safeReddito, massimale);
  const contributiOrdinari = baseContributivaInps * clamp(contributiInpsPerc, 0, 1);
  const baseIvsAggiuntiva = Math.max(baseContributivaInps - Math.max(sogliaIvsAggiuntivo, 0), 0);
  const contributoIvsAggiuntivo = baseIvsAggiuntiva * clamp(aliquotaIvsAggiuntivaPerc, 0, 1);

  return Math.max(safeReddito - contributiOrdinari - contributoIvsAggiuntivo, 0);
}

export function calculateIncomeTax(reddito) {
  const safeReddito = Math.max(reddito, 0);
  let imposta = 0;
  let lowerBound = 0;

  for (const bracket of irpef.brackets) {
    const taxableAmount = Math.max(Math.min(safeReddito, bracket.upTo) - lowerBound, 0);
    imposta += taxableAmount * bracket.rate;
    if (safeReddito <= bracket.upTo) break;
    lowerBound = bracket.upTo;
  }

  if (safeReddito > irpef.highIncomeAdjustment.threshold) {
    imposta += irpef.highIncomeAdjustment.amount;
  }
  return imposta;
}

export function calculateMarginalIncomeTaxRate(reddito) {
  const safeReddito = Math.max(reddito, 0);
  return irpef.brackets.find((bracket) => safeReddito <= bracket.upTo)?.rate
    ?? irpef.brackets.at(-1).rate;
}

export function calculateEmployeeDeduction(reddito) {
  const rules = irpef.employeeDeduction;
  let detrazione;

  if (reddito <= rules.minimumIncomeLimit) {
    detrazione = rules.minimumAmount;
  } else if (reddito <= rules.middleIncomeLimit) {
    const range = rules.middleIncomeLimit - rules.minimumIncomeLimit;
    const rapporto = (rules.middleIncomeLimit - reddito) / range;
    detrazione = rules.middleBaseAmount + (rules.middleVariableAmount * rapporto);
  } else if (reddito <= rules.maximumIncomeLimit) {
    const range = rules.maximumIncomeLimit - rules.middleIncomeLimit;
    const rapporto = (rules.maximumIncomeLimit - reddito) / range;
    detrazione = rules.middleBaseAmount * rapporto;
  } else {
    detrazione = 0;
  }

  if (reddito >= rules.extraFrom && reddito <= rules.extraTo) {
    detrazione += rules.extraAmount;
  }

  return detrazione;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
