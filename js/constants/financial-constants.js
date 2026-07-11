import { CURRENT_FISCAL_RULES } from './fiscal-rules.js';

const rules = CURRENT_FISCAL_RULES;

export const FINANCIAL_CONSTANTS = {
  LIMITE_DEDUZIONE_FP: rules.pensionFund.deductionLimit,
  CONTRIBUTI_INPS_DEFAULT: rules.inps.employeeRate,
  MASSIMALE_CONTRIBUTIVO_INPS: rules.inps.contributionCeiling,
  SOGLIA_IVS_AGGIUNTIVO: rules.inps.additionalIvsThreshold,
  ALIQUOTA_IVS_AGGIUNTIVO: rules.inps.additionalIvsRate,
  TRATTAMENTO_INTEGRATIVO_IMPORTO: rules.supplementaryTreatment.amount,
  TRATTAMENTO_INTEGRATIVO_SOGLIA_PIENA: rules.supplementaryTreatment.fullThreshold,
  TRATTAMENTO_INTEGRATIVO_SOGLIA_MAX: rules.supplementaryTreatment.maximumThreshold,
  BONUS_CUNEO_SOGLIA_1: rules.taxWedgeBonus.thresholds[0],
  BONUS_CUNEO_SOGLIA_2: rules.taxWedgeBonus.thresholds[1],
  BONUS_CUNEO_SOGLIA_3: rules.taxWedgeBonus.thresholds[2],
  BONUS_CUNEO_SOGLIA_4: rules.taxWedgeBonus.thresholds[3],
  BONUS_CUNEO_SOGLIA_5: rules.taxWedgeBonus.thresholds[4],
  BONUS_CUNEO_ALIQUOTA_1: rules.taxWedgeBonus.rates[0],
  BONUS_CUNEO_ALIQUOTA_2: rules.taxWedgeBonus.rates[1],
  BONUS_CUNEO_ALIQUOTA_3: rules.taxWedgeBonus.rates[2],
  BONUS_CUNEO_DETRAZIONE_PIENA: rules.taxWedgeBonus.fullDeduction,
  TASSAZIONE_RENDIMENTI_AGEVOLATA: rules.investmentTax.governmentBondsRate,
  TASSAZIONE_RENDIMENTI_FP_ORDINARIA: rules.investmentTax.pensionFundOrdinaryRate,
  TASSAZIONE_RENDIMENTI_PAC_ORDINARIA: rules.investmentTax.pacOrdinaryRate
};

/**
 * Comparti Fondo Pensione con rendimenti ipotizzati per la simulazione.
 * Il modello li tratta come già al netto della tassazione annuale (12.5-20%).
 */
export const COMPARTI_FP = {
  garantito: {
    nome: 'Garantito',
    rendimentoDefault: 2
  },
  prudente: {
    nome: 'Prudente',
    rendimentoDefault: 2.5
  },
  bilanciato: {
    nome: 'Bilanciato',
    rendimentoDefault: 3
  },
  dinamico: {
    nome: 'Dinamico',
    rendimentoDefault: 4
  },
  custom: {
    nome: 'Personalizzato',
    rendimentoDefault: 3
  }
};

/**
 * ETF Preset per PAC con rendimenti ipotizzati per la simulazione.
 * Il modello li tratta come rendimenti netti stimati, gia al netto di TER, bollo e fiscalita attesa.
 */
export const ETF_PRESETS = {
  msciWorld: {
    nome: 'MSCI World (SWDA)',
    isin: 'IE00B4L5Y983',
    rendimentoDefault: 6,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00B4L5Y983'
  },
  ftseAllWorld: {
    nome: 'FTSE All-World (VWCE)',
    isin: 'IE00BK5BQT80',
    rendimentoDefault: 5.5,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BK5BQT80'
  },
  lifeStrategy80: {
    nome: 'LifeStrategy 80%',
    isin: 'IE00BMVB5R75',
    rendimentoDefault: 4.8,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BMVB5R75'
  },
  lifeStrategy60: {
    nome: 'LifeStrategy 60%',
    isin: 'IE00BMVB5P51',
    rendimentoDefault: 3.7,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BMVB5P51'
  },
  lifeStrategy40: {
    nome: 'LifeStrategy 40%',
    isin: 'IE00BMVB5M21',
    rendimentoDefault: 2.6,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BMVB5M21'
  },
  lifeStrategy20: {
    nome: 'LifeStrategy 20%',
    isin: 'IE00BMVB5K07',
    rendimentoDefault: 1.6,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BMVB5K07'
  },
  custom: {
    nome: 'Personalizzato',
    rendimentoDefault: 6,
    link: null
  }
};
