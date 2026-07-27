export function applyYearGrowth(state, {
  fpContributo,
  fpContributoDeducibile = fpContributo,
  pacContributo,
  risparmioAnno,
  rFP,
  rPAC,
  fpGrowthOptions = {},
  pacGrowthOptions = {},
  reinvestiRisparmio
}) {
  state.montanteFP = applyFpAnnualGrowth(state.montanteFP, fpContributo, rFP, fpGrowthOptions);
  state.contributiFP += fpContributo;
  // Compatibilità con stati creati prima della separazione: la contribuzione
  // FP già presente era interamente trattata come deducibile.
  const deducibiliPrecedenti = Number.isFinite(state.contributiFpDeducibili)
    ? state.contributiFpDeducibili
    : state.contributiFP - fpContributo;
  const nonDeducibiliPrecedenti = Number.isFinite(state.contributiFpNonDeducibili)
    ? state.contributiFpNonDeducibili
    : 0;
  const deducibileAnno = Math.min(Math.max(fpContributoDeducibile, 0), Math.max(fpContributo, 0));
  state.contributiFpDeducibili = deducibiliPrecedenti + deducibileAnno;
  state.contributiFpNonDeducibili = nonDeducibiliPrecedenti + Math.max(fpContributo - deducibileAnno, 0);
  state.montantePAC = applyPacAnnualGrowth(state.montantePAC, pacContributo, rPAC, pacGrowthOptions);
  state.investimentoPAC += pacContributo;
  state.risparmioAccumulato += risparmioAnno;
  state.risparmioDaReinvestire = reinvestiRisparmio ? risparmioAnno : 0;
}

export function calculateEffectiveTaxRate(quotaAgevolataPerc = 0, aliquotaAgevolata = 0.125, aliquotaOrdinaria = 0.26) {
  const quotaAgevolata = Math.min(Math.max(quotaAgevolataPerc, 0), 1);
  return (quotaAgevolata * aliquotaAgevolata) + ((1 - quotaAgevolata) * aliquotaOrdinaria);
}

export function calculateNetAnnualReturn(rendimento, {
  mode = 'netto',
  costiAnnui = 0,
  taxRate = 0,
  taxTiming = 'none'
} = {}) {
  const safeReturn = Number.isFinite(rendimento) ? rendimento : 0;
  if (mode !== 'lordo') return safeReturn;

  const safeCosts = Math.min(Math.max(costiAnnui, 0), 1);
  const returnAfterCosts = ((1 + safeReturn) * (1 - safeCosts)) - 1;
  if (taxTiming !== 'annual') return returnAfterCosts;

  // Imposta sostitutiva sul risultato netto maturato: si applica dopo i
  // costi (art. 17 D.Lgs. 252/2005) e solo se il risultato è positivo.
  const safeTaxRate = Math.min(Math.max(taxRate, 0), 1);
  return returnAfterCosts > 0 ? returnAfterCosts * (1 - safeTaxRate) : returnAfterCosts;
}

/**
 * Rendimento annuo equivalente di uno strumento tassato solo all'exit
 * (PAC): capitalizza al netto dei costi per `anni`, tassa il solo gain
 * finale e riporta tutto a un tasso annuo composto, confrontabile con uno
 * strumento tassato anno per anno come il FP.
 */
export function calculateExitEquivalentAnnualReturn(rendimento, {
  mode = 'netto',
  costiAnnui = 0,
  taxRate = 0
} = {}, anni = 1) {
  const returnAfterCosts = calculateNetAnnualReturn(rendimento, { mode, costiAnnui, taxTiming: 'none' });
  if (mode !== 'lordo') return returnAfterCosts;

  const safeYears = Math.max(Math.floor(anni), 1);
  const safeTaxRate = Math.min(Math.max(taxRate, 0), 1);
  const factor = Math.pow(1 + returnAfterCosts, safeYears);
  const netFactor = factor - (Math.max(factor - 1, 0) * safeTaxRate);
  return Math.pow(netFactor, 1 / safeYears) - 1;
}

export function applyFpAnnualGrowth(montante, contributo, rendimento, options = {}) {
  if (options.mode !== 'lordo') {
    const netReturn = calculateNetAnnualReturn(rendimento, options);
    return Math.max((montante * (1 + netReturn)) + contributo, 0);
  }

  const returnAfterCosts = calculateNetAnnualReturn(rendimento, { ...options, taxTiming: 'none' });
  const fixedCost = montante > 0 || contributo > 0
    ? Math.max(options.costoFissoAnnuo || 0, 0) : 0;
  const montanteDopoCosti = (montante * (1 + returnAfterCosts)) - fixedCost;
  // Imposta sostitutiva sul risultato netto maturato: la variazione annua del
  // montante già al netto di costi proporzionali e fissi; niente imposta se
  // il risultato è negativo.
  const risultatoImponibile = montanteDopoCosti - montante;
  const imposta = Math.max(risultatoImponibile, 0) * Math.min(Math.max(options.taxRate || 0, 0), 1);
  return Math.max(montanteDopoCosti - imposta + contributo, 0);
}

export function applyPacAnnualGrowth(montante, contributo, rendimento, options = {}) {
  const netReturnBeforeExitTax = calculateNetAnnualReturn(rendimento, {
    ...options,
    taxTiming: 'exit'
  });
  const fixedCost = options.mode === 'lordo' && (montante > 0 || contributo > 0)
    ? Math.max(options.costoFissoAnnuo || 0, 0) : 0;
  return Math.max((montante * (1 + netReturnBeforeExitTax)) + contributo - fixedCost, 0);
}

export function projectFpContribution(contributo, rendimento, anni, options = {}) {
  let montante = 0;
  for (let i = 0; i < anni; i++) {
    montante = applyFpAnnualGrowth(montante, i === 0 ? contributo : 0, rendimento, options);
  }
  return montante;
}

export function projectPacContribution(contributo, rendimento, anni, options = {}) {
  let montante = 0;
  for (let i = 0; i < anni; i++) {
    montante = applyPacAnnualGrowth(montante, i === 0 ? contributo : 0, rendimento, options);
  }
  return montante;
}

export function calculateStrategyExit(
  state,
  tassazioneFP,
  reinvestiRisparmio,
  includeTaxSavings = true,
  pacExitOptions = {}
) {
  const exitFP = calculateFpExit({
    montante: state.montanteFP,
    contributi: Number.isFinite(state.contributiFpDeducibili)
      ? state.contributiFpDeducibili
      : state.contributiFP,
    contributiNonDedotti: Number.isFinite(state.contributiFpNonDeducibili)
      ? state.contributiFpNonDeducibili
      : 0,
    tassazione: tassazioneFP,
    risparmioAnno: includeTaxSavings ? state.risparmioDaReinvestire : 0,
    risparmioAccumulato: includeTaxSavings ? state.risparmioAccumulato : 0,
    reinvestiRisparmio
  });
  const exitPAC = calculatePacExit(state.montantePAC, state.investimentoPAC, pacExitOptions);

  return exitFP + exitPAC + Math.max(state.liquidita || 0, 0);
}

/**
 * Base imponibile della prestazione FP: i contributi dedotti, ma mai oltre
 * quanto la prestazione può effettivamente restituire una volta tolti i
 * contributi non dedotti (che rientrano esenti). Se costi o perdite hanno
 * eroso il montante sotto i contributi, l'imponibile si riduce di
 * conseguenza: l'exit non può mai risultare negativa.
 */
export function calculateFpExitTaxBase(montante, contributiDedotti, contributiNonDedotti = 0) {
  const disponibile = Math.max(montante - Math.max(contributiNonDedotti, 0), 0);
  return Math.max(Math.min(Math.max(contributiDedotti, 0), disponibile), 0);
}

export function calculateFpExit({
  montante,
  contributi,
  contributiNonDedotti = 0,
  tassazione,
  risparmioAnno,
  risparmioAccumulato,
  reinvestiRisparmio
}) {
  const risparmioDaAggiungere = reinvestiRisparmio ? risparmioAnno : risparmioAccumulato;
  const imponibile = calculateFpExitTaxBase(montante, contributi, contributiNonDedotti);
  return montante - (imponibile * tassazione) + risparmioDaAggiungere;
}

export function calculatePacExit(montante, investimentoTotale, { mode = 'netto', taxRate = 0 } = {}) {
  if (mode !== 'lordo') return montante;

  const gain = Math.max(montante - investimentoTotale, 0);
  return montante - (gain * Math.min(Math.max(taxRate, 0), 1));
}

export function createGrowthOptions({
  mode = 'netto',
  costiAnnui = 0,
  costoFissoAnnuo = 0,
  quotaAgevolataPerc = 0,
  aliquotaAgevolata = 0.125,
  aliquotaOrdinaria = 0.26
} = {}) {
  const taxRate = calculateEffectiveTaxRate(quotaAgevolataPerc, aliquotaAgevolata, aliquotaOrdinaria);
  return {
    mode,
    costiAnnui: Math.min(Math.max(costiAnnui, 0), 1),
    costoFissoAnnuo: Math.max(costoFissoAnnuo, 0),
    quotaAgevolataPerc: Math.min(Math.max(quotaAgevolataPerc, 0), 1),
    taxRate
  };
}

export function calculatePacExitTax(montante, investimentoTotale, options = {}) {
  return montante - calculatePacExit(montante, investimentoTotale, options);
}
