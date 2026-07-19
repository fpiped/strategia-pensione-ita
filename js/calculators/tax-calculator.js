import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';
import { CURRENT_FISCAL_RULES } from '../constants/fiscal-rules.js';
import { calculateLocalTaxes } from './local-tax-calculator.js';

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
  localTaxRules = [],
  detrazioniOrdinarie = null,
  detrazioniTrattamentoIntegrativo = 0,
  // Compatibilità per chiamate costruite prima della separazione dei campi:
  // il vecchio importo resta prudenzialmente una detrazione solo ordinaria.
  ulterioriDetrazioni = 0,
  quotaMinAderente = 0,
  modalitaVersamentoFp = 'quotaMinimaBusta',
  quotaBustaFp = null,
  limiteDeduzioneTotale = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP
}) {
  // Il reddito da lavoro (RAL e premi) paga l'INPS; gli altri redditi
  // entrano solo nell'imponibile IRPEF. Le due basi restano distinte per
  // misure sul cuneo (percentuale sul lavoro, soglie sul complessivo).
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
  const effectiveLocalTaxRules = Array.isArray(localTaxRules) ? localTaxRules : [];
  const ordinaryDeductions = Math.max(detrazioniOrdinarie ?? ulterioriDetrazioni, 0);
  const supplementaryTreatmentDeductions = Math.max(detrazioniTrattamentoIntegrativo, 0);

  const redditoDedotto = Math.max(redditoImponibile - deduzione, 0);
  const redditoDetrazioniDedotto = Math.max(redditoImponibile - quotaBusta, 0);
  const before = calculateTaxPosition({
    taxableIncome: redditoImponibile,
    personalIncome: redditoImponibile,
    workIncome: imponibileLavoro,
    localTaxRules: effectiveLocalTaxRules,
    detrazioniOrdinarie: ordinaryDeductions,
    detrazioniTrattamentoIntegrativo: supplementaryTreatmentDeductions
  });
  const after = calculateTaxPosition({
    taxableIncome: redditoDedotto,
    // Solo la quota in busta riduce le basi personali usate da detrazione
    // lavoro, trattamento integrativo, cuneo e soglia redditi elevati.
    personalIncome: redditoDetrazioniDedotto,
    workIncome: Math.max(imponibileLavoro - quotaBusta, 0),
    localTaxRules: effectiveLocalTaxRules,
    detrazioniOrdinarie: ordinaryDeductions,
    detrazioniTrattamentoIntegrativo: supplementaryTreatmentDeductions
  });

  return {
    deduction: deduzione,
    payrollContribution: quotaBusta,
    before,
    after,
    saving: before.fiscalCost - after.fiscalCost
  };
}

function calculateTaxPosition({
  taxableIncome,
  personalIncome,
  workIncome,
  localTaxRules,
  detrazioniOrdinarie,
  detrazioniTrattamentoIntegrativo
}) {
  const grossIncomeTax = calculateIncomeTax(taxableIncome);
  const employeeDeduction = calculateEmployeeDeduction(personalIncome);
  const highIncomeDeductionsCut = calculateHighIncomeDetrazioniCut(personalIncome);
  const otherDeductions = detrazioniOrdinarie + detrazioniTrattamentoIntegrativo;
  const usableOtherDeductions = Math.max(otherDeductions - highIncomeDeductionsCut, 0);
  const taxWedge = calculateTaxWedgeSupport(personalIncome, workIncome);
  const capacityBeforeTaxWedge = Math.max(
    grossIncomeTax - employeeDeduction - usableOtherDeductions,
    0
  );
  const taxWedgeDeductionUsed = Math.min(taxWedge.taxDeduction, capacityBeforeTaxWedge);
  const localTaxes = calculateLocalTaxes(taxableIncome, localTaxRules);
  const { irpefNetta, addizionaliDovute, impostaNetta } = calculateNetTaxDue({
    impostaLorda: grossIncomeTax,
    addizionali: localTaxes,
    detrazioni: employeeDeduction + usableOtherDeductions + taxWedge.taxDeduction
  });
  const supplementaryTreatmentWorkGrossTax = calculateIncomeTax(workIncome);
  const supplementaryTreatmentTotalGrossTax = calculateIncomeTax(personalIncome);
  const supplementaryTreatment = calculateTrattamentoIntegrativo({
    redditoComplessivo: personalIncome,
    impostaLordaLavoro: supplementaryTreatmentWorkGrossTax,
    impostaLordaComplessiva: supplementaryTreatmentTotalGrossTax,
    detrazioniLavoro: employeeDeduction,
    detrazioniRilevanti: detrazioniTrattamentoIntegrativo
  });

  return {
    taxableIncome,
    employeeDeductionIncome: personalIncome,
    taxWedgeTotalIncome: personalIncome,
    taxWedgeWorkIncome: workIncome,
    grossIncomeTax,
    localTaxes: addizionaliDovute,
    employeeDeduction,
    ordinaryDeductions: detrazioniOrdinarie,
    supplementaryTreatmentDeductions: detrazioniTrattamentoIntegrativo,
    otherDeductions,
    highIncomeDeductionsCut,
    irpefNetTax: irpefNetta,
    netTax: impostaNetta,
    supplementaryTreatmentWorkGrossTax,
    supplementaryTreatmentTotalGrossTax,
    supplementaryTreatment,
    taxWedgeCashAmount: taxWedge.cashAmount,
    taxWedgeDeduction: taxWedge.taxDeduction,
    taxWedgeDeductionUsed,
    taxWedgeBonus: taxWedge.cashAmount + taxWedgeDeductionUsed,
    fiscalCost: impostaNetta - supplementaryTreatment - taxWedge.cashAmount
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
  redditoComplessivo = null,
  impostaLordaLavoro = null,
  impostaLordaComplessiva = null,
  detrazioniLavoro = 0,
  detrazioniRilevanti = 0,
  // Alias mantenuti per compatibilità con chiamate precedenti.
  reddito = 0,
  impostaLorda = 0
}) {
  const safeReddito = Math.max(redditoComplessivo ?? reddito, 0);
  const safeImpostaLordaLavoro = Math.max(impostaLordaLavoro ?? impostaLorda, 0);
  const safeImpostaLordaComplessiva = Math.max(impostaLordaComplessiva ?? impostaLorda, 0);
  const importo = FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_IMPORTO;

  // Fino a 15.000€ la capienza usa esclusivamente l'imposta lorda generata
  // dai redditi di lavoro ammessi. La detrazione lavoro si confronta ridotta
  // di 75€ per neutralizzare l'aumento da 1.880€ a 1.955€.
  if (
    safeReddito <= FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_PIENA &&
    safeImpostaLordaLavoro > detrazioniLavoro - FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_RIDUZIONE_DETRAZIONE
  ) {
    return importo;
  }

  if (
    safeReddito > FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_PIENA &&
    safeReddito <= FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_MAX
  ) {
    const incapienzaDetrazioni = detrazioniLavoro
      + Math.max(detrazioniRilevanti, 0)
      - safeImpostaLordaComplessiva;
    return Math.max(Math.min(importo, incapienzaDetrazioni), 0);
  }

  return 0;
}

/**
 * Cuneo L. 207/2024: fino a 20.000€ è una somma esente, quindi non dipende
 * dalla capienza IRPEF; tra 20.000€ e 40.000€ è una detrazione dall'imposta
 * lorda e sarà limitata alla capienza nel calcolo della posizione fiscale.
 */
export function calculateTaxWedgeSupport(redditoComplessivo, redditoLavoro = redditoComplessivo) {
  const reddito = Math.max(redditoComplessivo, 0);
  const lavoro = Math.max(redditoLavoro, 0);
  if (lavoro <= 0) return { cashAmount: 0, taxDeduction: 0 };

  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_3) {
    const aliquota = lavoro <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_1
      ? FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_1
      : lavoro <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_2
        ? FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_2
        : FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_3;
    return { cashAmount: lavoro * aliquota, taxDeduction: 0 };
  }
  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_4) {
    return {
      cashAmount: 0,
      taxDeduction: FINANCIAL_CONSTANTS.BONUS_CUNEO_DETRAZIONE_PIENA
    };
  }
  if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5) {
    return {
      cashAmount: 0,
      taxDeduction: FINANCIAL_CONSTANTS.BONUS_CUNEO_DETRAZIONE_PIENA *
        (FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5 - reddito) /
        (FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5 - FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_4)
    };
  }

  return { cashAmount: 0, taxDeduction: 0 };
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
