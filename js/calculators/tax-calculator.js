import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';

export function calculateTaxSavings({
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

  return costoFiscaleNetto - costoFiscaleNettoDedotto;
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
  if (reddito <= 28000) {
    return reddito * 0.23;
  }
  if (reddito <= 50000) {
    return 28000 * 0.23 + (reddito - 28000) * 0.35;
  }
  return 28000 * 0.23 + 22000 * 0.35 + (reddito - 50000) * 0.43;
}

export function calculateEmployeeDeduction(reddito) {
  let detrazione;

  if (reddito <= 15000) {
    detrazione = 1955;
  } else if (reddito <= 28000) {
    const rapporto = (28000 - reddito) / 13000;
    detrazione = 1910 + (1190 * rapporto);
  } else if (reddito <= 50000) {
    const rapporto = (50000 - reddito) / 22000;
    detrazione = 1910 * rapporto;
  } else {
    detrazione = 0;
  }

  if (reddito >= 25000 && reddito <= 35000) {
    detrazione += 65;
  }

  return detrazione;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
