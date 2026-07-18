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
  altriRedditi = 0,
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
  // Il reddito da lavoro (RAL e premi) paga l'INPS; gli altri redditi
  // entrano solo nell'imponibile IRPEF. Le due basi restano distinte per
  // bonus cuneo (percentuale sul lavoro, soglie sul complessivo).
  const imponibileLavoro = calculateIrpefTaxableIncome({
    reddito,
    contributiInpsPerc,
    massimaleContributivoInps,
    sogliaIvsAggiuntivo,
    aliquotaIvsAggiuntivaPerc
  });
  const redditoImponibile = imponibileLavoro + Math.max(altriRedditi, 0);
  const limiteDeduzione = Math.max(limiteDeduzioneTotale - quotaDatoreFp, 0);
  const deduzione = Math.min(investimento, limiteDeduzione);
  const splitVersamento = splitFpPayment(investimento, quotaMinAderente, modalitaVersamentoFp);
  const quotaBustaRichiesta = Number.isFinite(quotaBustaFp)
    ? quotaBustaFp
    : splitVersamento.quotaBusta;
  const quotaBusta = Math.min(Math.max(quotaBustaRichiesta, 0), investimento, deduzione);

  const redditoComplessivoCuneo = redditoImponibile;
  const redditoComplessivoCuneoDedotto = Math.max(redditoComplessivoCuneo - quotaBusta, 0);
  const bonusCuneo = calculateBonusCuneoFiscale(redditoComplessivoCuneo, imponibileLavoro);
  const bonusCuneoDedotto = calculateBonusCuneoFiscale(
    redditoComplessivoCuneoDedotto,
    Math.max(imponibileLavoro - quotaBusta, 0)
  );

  const impostaLorda = calculateIncomeTax(redditoImponibile);
  const addizionali = redditoImponibile * addizionaliPerc;
  const detrazione = calculateEmployeeDeduction(redditoImponibile);
  const trattamentoIntegrativo = calculateTrattamentoIntegrativo({
    reddito: redditoImponibile,
    impostaLorda,
    detrazioniLavoro: detrazione,
    ulterioriDetrazioni
  });
  // La soglia dei redditi alti si valuta sul reddito complessivo (qui pari
  // all'imponibile: nessun onere deducibile è ancora applicato). La
  // riduzione colpisce solo le detrazioni per oneri (art. 16-ter TUIR),
  // qui rappresentate da ulterioriDetrazioni: mai la detrazione lavoro.
  const riduzioneDetrazioni = calculateHighIncomeDetrazioniCut(redditoImponibile);
  const { addizionaliDovute, impostaNetta } = calculateNetTaxDue({
    impostaLorda,
    addizionali,
    detrazioni: detrazione + Math.max(ulterioriDetrazioni - riduzioneDetrazioni, 0)
  });
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
  // Con FP il reddito complessivo scende solo della quota in busta: il
  // bonifico è onere deducibile e non sposta la soglia dei redditi alti.
  const riduzioneDetrazioniDedotta = calculateHighIncomeDetrazioniCut(redditoDetrazioniDedotto);
  const { addizionaliDovute: addizionaliDovuteDedotte, impostaNetta: impostaNettaDedotta } = calculateNetTaxDue({
    impostaLorda: impostaLordaDedotta,
    addizionali: addizionaliDedotte,
    detrazioni: detrazioneDedotta + Math.max(ulterioriDetrazioni - riduzioneDetrazioniDedotta, 0)
  });
  const costoFiscaleNettoDedotto = impostaNettaDedotta - trattamentoIntegrativoDedotto - bonusCuneoDedotto;

  return {
    deduction: deduzione,
    payrollContribution: quotaBusta,
    before: {
      taxableIncome: redditoImponibile,
      grossIncomeTax: impostaLorda,
      localTaxes: addizionaliDovute,
      employeeDeduction: detrazione,
      otherDeductions: ulterioriDetrazioni,
      highIncomeDeductionsCut: riduzioneDetrazioni,
      netTax: impostaNetta,
      supplementaryTreatment: trattamentoIntegrativo,
      taxWedgeBonus: bonusCuneo,
      fiscalCost: costoFiscaleNetto
    },
    after: {
      taxableIncome: redditoDedotto,
      employeeDeductionIncome: redditoDetrazioniDedotto,
      grossIncomeTax: impostaLordaDedotta,
      localTaxes: addizionaliDovuteDedotte,
      employeeDeduction: detrazioneDedotta,
      otherDeductions: ulterioriDetrazioni,
      highIncomeDeductionsCut: riduzioneDetrazioniDedotta,
      netTax: impostaNettaDedotta,
      supplementaryTreatment: trattamentoIntegrativoDedotto,
      taxWedgeBonus: bonusCuneoDedotto,
      fiscalCost: costoFiscaleNettoDedotto
    },
    saving: costoFiscaleNetto - costoFiscaleNettoDedotto
  };
}

/**
 * IRPEF netta e addizionali dovute. Le detrazioni abbattono solo l'IRPEF:
 * l'eventuale eccedenza si perde e non compensa le addizionali. Le addizionali
 * sono dovute per intero se l'IRPEF netta dell'anno è positiva, non dovute
 * se le detrazioni la azzerano (art. 50 c. 2 D.Lgs. 446/1997; art. 1 c. 4
 * D.Lgs. 360/1998).
 */
export function calculateNetTaxDue({ impostaLorda, addizionali = 0, detrazioni = 0 }) {
  const irpefNetta = Math.max(impostaLorda - detrazioni, 0);
  const addizionaliDovute = irpefNetta > 0 ? Math.max(addizionali, 0) : 0;
  return {
    irpefNetta,
    addizionaliDovute,
    impostaNetta: irpefNetta + addizionaliDovute
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

  // Capienza ex L. 207/2024: la detrazione lavoro si confronta ridotta di 75€,
  // per non negare il beneficio a chi era capiente prima dell'aumento a 1.955€.
  if (
    safeReddito <= FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_PIENA &&
    impostaLorda > detrazioniLavoro - FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_RIDUZIONE_DETRAZIONE
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

/**
 * Bonus cuneo L. 207/2024: la somma integrativa (fino a 20.000€) è una
 * percentuale del reddito di lavoro dipendente, mentre le soglie di accesso
 * e il décalage 20-40k si valutano sul reddito complessivo. Con un solo
 * reddito da lavoro le due basi coincidono (default).
 */
export function calculateBonusCuneoFiscale(redditoComplessivo, redditoLavoro = redditoComplessivo) {
  const reddito = Math.max(redditoComplessivo, 0);
  const lavoro = Math.max(redditoLavoro, 0);
  if (lavoro <= 0) return 0;

  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_3) {
    const aliquota = lavoro <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_1
      ? FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_1
      : lavoro <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_2
        ? FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_2
        : FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_3;
    return lavoro * aliquota;
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
  altriRedditi = 0,
  contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
  massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
  sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
  aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO
}) {
  // I contributi previdenziali gravano solo sul reddito da lavoro
  // dipendente (RAL e premi); gli altri redditi entrano nell'imponibile
  // IRPEF senza passare dalla base contributiva.
  const safeReddito = Math.max(reddito, 0);
  const safeAltriRedditi = Math.max(altriRedditi, 0);
  const massimale = massimaleContributivoInps > 0 ? massimaleContributivoInps : safeReddito;
  const baseContributivaInps = Math.min(safeReddito, massimale);
  const contributiOrdinari = baseContributivaInps * clamp(contributiInpsPerc, 0, 1);
  const baseIvsAggiuntiva = Math.max(baseContributivaInps - Math.max(sogliaIvsAggiuntivo, 0), 0);
  const contributoIvsAggiuntivo = baseIvsAggiuntiva * clamp(aliquotaIvsAggiuntivaPerc, 0, 1);

  return Math.max(safeReddito - contributiOrdinari - contributoIvsAggiuntivo, 0) + safeAltriRedditi;
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

  return imposta;
}

/**
 * Sterilizzazione del taglio IRPEF per i redditi alti (Bilancio 2026):
 * sopra la soglia le detrazioni spettanti sono ridotte di un importo fisso.
 * La soglia si valuta sul reddito complessivo: gli oneri deducibili (FP a
 * bonifico) non lo riducono, i versamenti in busta sì. Se le detrazioni
 * disponibili sono inferiori, la riduzione si perde (incapienza).
 */
export function calculateHighIncomeDetrazioniCut(redditoComplessivo) {
  return redditoComplessivo > irpef.highIncomeAdjustment.threshold
    ? irpef.highIncomeAdjustment.amount
    : 0;
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
