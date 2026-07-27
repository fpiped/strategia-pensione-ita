export const CURRENT_FISCAL_YEAR = 2026;

export const FISCAL_RULES = {
  2026: {
    meta: {
      year: 2026,
      effectiveFrom: '2026-01-01',
      configurationUpdated: '2026-07-27'
    },
    pensionFund: {
      deductionLimit: 5300,
      exitTax: {
        initialRate: 0.15,
        reductionPerYear: 0.003,
        reductionStartsAfterYears: 15,
        minimumRate: 0.09,
        earlyRedemptionRate: 0.23
      }
    },
    inps: {
      employeeRate: 0.0919,
      contributionCeiling: 122295,
      additionalIvsThreshold: 56224,
      additionalIvsRate: 0.01
    },
    irpef: {
      brackets: [
        { upTo: 28000, rate: 0.23 },
        { upTo: 50000, rate: 0.33 },
        { upTo: Infinity, rate: 0.43 }
      ],
      highIncomeAdjustment: {
        threshold: 200000,
        amount: 440
      },
      employeeDeduction: {
        minimumIncomeLimit: 15000,
        minimumAmount: 1955,
        middleIncomeLimit: 28000,
        middleBaseAmount: 1910,
        middleVariableAmount: 1190,
        maximumIncomeLimit: 50000,
        extraAmount: 65,
        extraFrom: 25000,
        extraTo: 35000
      }
    },
    supplementaryTreatment: {
      amount: 1200,
      fullThreshold: 15000,
      maximumThreshold: 28000,
      // Capienza: l'imposta lorda si confronta con la detrazione lavoro
      // diminuita di 75€ (neutralizza l'aumento 1.880 → 1.955 della detrazione).
      capienzaDeductionReduction: 75
    },
    taxWedgeBonus: {
      thresholds: [8500, 15000, 20000, 32000, 40000],
      rates: [0.071, 0.053, 0.048],
      fullDeduction: 1000
    },
    investmentTax: {
      governmentBondsRate: 0.125,
      pensionFundOrdinaryRate: 0.20,
      pacOrdinaryRate: 0.26
    },
    documentation: [
      {
        id: 'irpef',
        title: 'Scaglioni IRPEF',
        sourceNote: 'Agenzia delle Entrate — aliquote IRPEF (Bilancio 2026); sopra 200.000€ di reddito complessivo il beneficio del taglio è sterilizzato riducendo di 440€ le detrazioni per oneri, escluse le spese sanitarie (art. 16-ter TUIR, mod. L. 199/2025 art. 1 c. 4)',
        sources: [
          { label: 'Agenzia delle Entrate', url: 'https://www.agenziaentrate.gov.it/portale/imposta-sul-reddito-delle-persone-fisiche-irpef-/aliquote-e-calcolo-dell-irpef' },
          { label: 'L. 199/2025', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2025-12-30;199' }
        ],
        effective: 'dal 2026'
      },
      {
        id: 'employeeDeduction',
        title: 'Detrazione lavoro dipendente minima',
        sourceNote: 'L. 207/2024, art. 13 TUIR',
        sources: [{ label: 'L. 207/2024', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2024-12-30;207' }],
        effective: 'dal 2025'
      },
      {
        id: 'pensionDeduction',
        title: 'Limite deduzione FP',
        sourceNote: 'L. 199/2025 (Bilancio 2026), art. 1 c. 201, che modifica l’art. 8 c. 4 D.Lgs. 252/2005',
        sources: [
          { label: 'L. 199/2025', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2025-12-30;199' },
          { label: 'D.Lgs. 252/2005', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-12-05;252' },
          { label: 'Ministero del Lavoro — FAQ previdenza complementare', url: 'https://www.lavoro.gov.it/previdenza-complementare/glossario-e-faq/faq' }
        ],
        effective: 'dal 1/1/2026, primo adeguamento dal 2007'
      },
      {
        id: 'pensionExitTax',
        title: 'Tassazione uscita FP',
        sourceNote: 'Art. 11 c. 6 D.Lgs. 252/2005',
        sources: [{ label: 'D.Lgs. 252/2005', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-12-05;252' }],
        effective: 'in vigore dal 2007'
      },
      {
        id: 'nonDeductedContributions',
        title: 'Contributi FP non dedotti',
        sourceNote: 'Devono essere comunicati alla forma pensionistica per non essere tassati nuovamente alla prestazione',
        sources: [{ label: 'Ministero del Lavoro — FAQ previdenza complementare', url: 'https://www.lavoro.gov.it/previdenza-complementare/glossario-e-faq/faq' }],
        effective: 'comunicazione entro il 31 dicembre dell’anno successivo al versamento o, se precedente, prima della prestazione'
      },
      {
        id: 'earlyRedemption',
        title: 'Riscatto anticipato',
        sourceNote: 'Art. 14 c. 5 D.Lgs. 252/2005',
        sources: [{ label: 'D.Lgs. 252/2005', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-12-05;252' }],
        effective: 'in vigore dal 2007'
      },
      {
        id: 'inpsRate',
        title: 'Aliquota INPS lavoratore',
        sourceNote: 'Default di scenario per lavoratore dipendente privato; l’aliquota reale dipende dalla posizione contributiva',
        sources: [{ label: 'INPS, circolare 6/2026', url: 'https://www.inps.it/it/it/inps-comunica/atti/circolari-messaggi-e-normativa/dettaglio.circolari-e-messaggi.2026.01.circolare-numero-6-del-30-01-2026_15151.html' }],
        effective: 'default modificabile; soglie aggiornate al 2026'
      },
      {
        id: 'inpsCeiling',
        title: 'Massimale contributivo INPS',
        sourceNote: 'Circolare INPS minimali e massimali, art. 2 c. 18 L. 335/1995',
        sources: [{ label: 'INPS, circolare 6/2026', url: 'https://www.inps.it/it/it/inps-comunica/atti/circolari-messaggi-e-normativa/dettaglio.circolari-e-messaggi.2026.01.circolare-numero-6-del-30-01-2026_15151.html' }],
        effective: 'valori 2026'
      },
      {
        id: 'additionalIvs',
        title: 'IVS aggiuntivo',
        sourceNote: 'Art. 3-ter L. 438/1992; soglia da circolare INPS',
        sources: [{ label: 'INPS, circolare 6/2026', url: 'https://www.inps.it/it/it/inps-comunica/atti/circolari-messaggi-e-normativa/dettaglio.circolari-e-messaggi.2026.01.circolare-numero-6-del-30-01-2026_15151.html' }],
        effective: 'soglia 2026'
      },
      {
        id: 'supplementaryTreatment',
        title: 'Trattamento integrativo',
        sourceNote: 'D.L. 3/2020 conv. L. 21/2020, mod. L. 234/2021: fino a 15.000€ capienza sulla sola imposta lorda da lavoro; tra 15.000€ e 28.000€ confronto con l’imposta lorda complessiva. Detrazione lavoro ridotta di 75€ nel primo confronto ex L. 207/2024, art. 1 c. 3',
        sources: [
          { label: 'D.L. 3/2020', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2020-02-05;3' },
          { label: 'L. 207/2024', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2024-12-30;207' }
        ],
        effective: 'dal 2022; correttivo capienza dal 2025'
      },
      {
        id: 'taxWedgeBonus',
        title: 'Somma e detrazione cuneo dipendenti',
        sourceNote: 'L. 207/2024, art. 1 c. 4-9: somma esente fino a 20.000€; ulteriore detrazione dall’imposta lorda tra 20.000€ e 40.000€',
        sources: [{ label: 'L. 207/2024', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2024-12-30;207' }],
        effective: 'dal 2025, a regime'
      },
      {
        id: 'pensionInvestmentTax',
        title: 'Tassazione annua rendimenti FP',
        sourceNote: 'L. 190/2014, art. 1 c. 621-624; imposta sul risultato netto maturato, già al netto dei costi di gestione (art. 17 D.Lgs. 252/2005)',
        sources: [
          { label: 'L. 190/2014', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2014-12-23;190' },
          { label: 'D.Lgs. 252/2005', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-12-05;252' }
        ],
        effective: 'dal 2015'
      },
      {
        id: 'pacCapitalGain',
        title: 'Capital gain PAC',
        sourceNote: 'D.L. 66/2014 conv. L. 89/2014',
        sources: [{ label: 'D.L. 66/2014', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2014-04-24;66' }],
        effective: 'dal 1/7/2014'
      },
      {
        id: 'localTaxes',
        title: 'Addizionali regionali e comunali',
        sourceNote: 'MEF — Fiscalità locale; base al netto degli oneri deducibili e dovute solo se l\'IRPEF netta è positiva (art. 50 c. 2 D.Lgs. 446/1997; art. 1 c. 4 D.Lgs. 360/1998)',
        sources: [
          { label: 'MEF — Fiscalità locale', url: 'https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/fiscalitalocale/' },
          { label: 'D.Lgs. 446/1997', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1997-12-15;446' },
          { label: 'D.Lgs. 360/1998', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1998-09-28;360' }
        ],
        effective: 'dati 2026 importati nel dataset locale'
      }
    ]
  }
};

export const CURRENT_FISCAL_RULES = FISCAL_RULES[CURRENT_FISCAL_YEAR];
