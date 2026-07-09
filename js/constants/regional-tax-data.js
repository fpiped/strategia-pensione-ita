// Addizionali regionali IRPEF 2026: dataset piccolo, caricato subito
// (serve al popolamento del selettore regione all'avvio).
export const REGIONAL_TAX_2026 = [
  { id: 'abruzzo', name: 'Abruzzo', provinceCodes: ['AQ', 'CH', 'PE', 'TE'], brackets: [{ upTo: 28000, rate: 1.67 }, { upTo: 50000, rate: 2.87 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'basilicata', name: 'Basilicata', provinceCodes: ['MT', 'PZ'], rate: 1.23 },
  { id: 'bolzano', name: 'Provincia autonoma di Bolzano', provinceCodes: ['BZ'], brackets: [{ upTo: 28000, rate: 1.23 }, { upTo: 50000, rate: 1.23 }, { upTo: Infinity, rate: 1.73 }] },
  { id: 'calabria', name: 'Calabria', provinceCodes: ['CS', 'CZ', 'KR', 'RC', 'VV'], rate: 1.73 },
  { id: 'campania', name: 'Campania', provinceCodes: ['AV', 'BN', 'CE', 'NA', 'SA'], brackets: [{ upTo: 15000, rate: 1.73 }, { upTo: 28000, rate: 2.96 }, { upTo: 50000, rate: 3.20 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'emilia-romagna', name: 'Emilia-Romagna', provinceCodes: ['BO', 'FC', 'FE', 'MO', 'PC', 'PR', 'RA', 'RE', 'RN'], brackets: [{ upTo: 15000, rate: 1.33 }, { upTo: 28000, rate: 1.93 }, { upTo: 50000, rate: 2.78 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'friuli-venezia-giulia', name: 'Friuli Venezia Giulia', provinceCodes: ['GO', 'PN', 'TS', 'UD'], brackets: [{ upTo: 15000, rate: 0.70 }, { upTo: Infinity, rate: 1.23 }] },
  { id: 'lazio', name: 'Lazio', provinceCodes: ['FR', 'LT', 'RI', 'RM', 'VT'], brackets: [{ upTo: 28000, rate: 1.73 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'liguria', name: 'Liguria', provinceCodes: ['GE', 'IM', 'SP', 'SV'], brackets: [{ upTo: 28000, rate: 1.23 }, { upTo: 50000, rate: 3.18 }, { upTo: Infinity, rate: 3.23 }] },
  { id: 'lombardia', name: 'Lombardia', provinceCodes: ['BG', 'BS', 'CO', 'CR', 'LC', 'LO', 'MB', 'MI', 'MN', 'PV', 'SO', 'VA'], brackets: [{ upTo: 15000, rate: 1.23 }, { upTo: 28000, rate: 1.58 }, { upTo: 50000, rate: 1.72 }, { upTo: Infinity, rate: 1.73 }] },
  { id: 'marche', name: 'Marche', provinceCodes: ['AN', 'AP', 'FM', 'MC', 'PU'], brackets: [{ upTo: 15000, rate: 1.23 }, { upTo: 28000, rate: 1.53 }, { upTo: 50000, rate: 1.70 }, { upTo: Infinity, rate: 1.73 }] },
  { id: 'molise', name: 'Molise', provinceCodes: ['CB', 'IS'], brackets: [{ upTo: 15000, rate: 1.73 }, { upTo: 28000, rate: 1.93 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'piemonte', name: 'Piemonte', provinceCodes: ['AL', 'AT', 'BI', 'CN', 'NO', 'TO', 'VB', 'VC'], brackets: [{ upTo: 15000, rate: 1.62 }, { upTo: 28000, rate: 2.68 }, { upTo: 50000, rate: 3.31 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'puglia', name: 'Puglia', provinceCodes: ['BA', 'BR', 'BT', 'FG', 'LE', 'TA'], brackets: [{ upTo: 15000, rate: 1.33 }, { upTo: 28000, rate: 2.13 }, { upTo: 50000, rate: 3.23 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'sardegna', name: 'Sardegna', provinceCodes: ['CA', 'NU', 'OR', 'SS', 'SU'], rate: 1.23 },
  { id: 'sicilia', name: 'Sicilia', provinceCodes: ['AG', 'CL', 'CT', 'EN', 'ME', 'PA', 'RG', 'SR', 'TP'], rate: 1.23 },
  { id: 'toscana', name: 'Toscana', provinceCodes: ['AR', 'FI', 'GR', 'LI', 'LU', 'MS', 'PI', 'PO', 'PT', 'SI'], brackets: [{ upTo: 15000, rate: 1.42 }, { upTo: 28000, rate: 1.43 }, { upTo: 50000, rate: 3.32 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'trento', name: 'Provincia autonoma di Trento', provinceCodes: ['TN'], brackets: [{ upTo: 50000, rate: 1.23 }, { upTo: Infinity, rate: 1.73 }] },
  { id: 'umbria', name: 'Umbria', provinceCodes: ['PG', 'TR'], brackets: [{ upTo: 15000, rate: 1.73 }, { upTo: 28000, rate: 3.02 }, { upTo: 50000, rate: 3.12 }, { upTo: Infinity, rate: 3.33 }] },
  { id: 'valle-aosta', name: "Valle d'Aosta", provinceCodes: ['AO'], rate: 1.23 },
  { id: 'veneto', name: 'Veneto', provinceCodes: ['BL', 'PD', 'RO', 'TV', 'VE', 'VI', 'VR'], rate: 1.23 }
];
