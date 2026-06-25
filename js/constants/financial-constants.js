export const FINANCIAL_CONSTANTS = {
  LIMITE_DEDUZIONE_FP: 5164.57,
  MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNUA: 2582.29,
  MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNI: 20,
  TASSAZIONE_INPS: 0.0919,
  TASSAZIONE_RENDITE_PAC: 0.26,
  IMPOSTA_BOLLO_PAC: 0.002
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
 * Sono valori modificabili dall'utente, non previsioni.
 */
export const ETF_PRESETS = {
  msciWorld: {
    nome: 'MSCI World (SWDA)',
    isin: 'IE00B4L5Y983',
    rendimentoDefault: 8,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00B4L5Y983'
  },
  ftseAllWorld: {
    nome: 'FTSE All-World (VWCE)',
    isin: 'IE00BK5BQT80',
    rendimentoDefault: 7,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BK5BQT80'
  },
  lifeStrategy80: {
    nome: 'LifeStrategy 80%',
    isin: 'IE00BMVB5R75',
    rendimentoDefault: 6,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BMVB5R75'
  },
  lifeStrategy60: {
    nome: 'LifeStrategy 60%',
    isin: 'IE00BMVB5P51',
    rendimentoDefault: 5,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BMVB5P51'
  },
  lifeStrategy40: {
    nome: 'LifeStrategy 40%',
    isin: 'IE00BMVB5M21',
    rendimentoDefault: 4,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BMVB5M21'
  },
  lifeStrategy20: {
    nome: 'LifeStrategy 20%',
    isin: 'IE00BMVB5K07',
    rendimentoDefault: 3,
    link: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BMVB5K07'
  },
  custom: {
    nome: 'Personalizzato',
    rendimentoDefault: 7,
    link: null
  }
};
