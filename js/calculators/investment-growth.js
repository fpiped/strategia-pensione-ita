export function applyYearGrowth(state, {
  fpContributo,
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
  const safeTaxRate = Math.min(Math.max(taxRate, 0), 1);
  const afterTaxReturn = taxTiming === 'annual'
    ? safeReturn * (1 - safeTaxRate)
    : safeReturn;

  return ((1 + afterTaxReturn) * (1 - safeCosts)) - 1;
}

export function applyFpAnnualGrowth(montante, contributo, rendimento, options = {}) {
  const netReturn = calculateNetAnnualReturn(rendimento, {
    ...options,
    taxTiming: options.mode === 'lordo' ? 'annual' : 'none'
  });
  return Math.max((montante + contributo) * (1 + netReturn), 0);
}

export function applyPacAnnualGrowth(montante, contributo, rendimento, options = {}) {
  const netReturnBeforeExitTax = calculateNetAnnualReturn(rendimento, {
    ...options,
    taxTiming: 'exit'
  });
  return Math.max((montante + contributo) * (1 + netReturnBeforeExitTax), 0);
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
    contributi: state.contributiFP,
    tassazione: tassazioneFP,
    risparmioAnno: includeTaxSavings ? state.risparmioDaReinvestire : 0,
    risparmioAccumulato: includeTaxSavings ? state.risparmioAccumulato : 0,
    reinvestiRisparmio
  });
  const exitPAC = calculatePacExit(state.montantePAC, state.investimentoPAC, pacExitOptions);

  return exitFP + exitPAC;
}

export function calculateFpExit({
  montante,
  contributi,
  tassazione,
  risparmioAnno,
  risparmioAccumulato,
  reinvestiRisparmio
}) {
  const risparmioDaAggiungere = reinvestiRisparmio ? risparmioAnno : risparmioAccumulato;
  return montante - (contributi * tassazione) + risparmioDaAggiungere;
}

export function calculatePacExit(montante, investimentoTotale, { mode = 'netto', taxRate = 0 } = {}) {
  if (mode !== 'lordo') return montante;

  const gain = Math.max(montante - investimentoTotale, 0);
  return montante - (gain * Math.min(Math.max(taxRate, 0), 1));
}

export function createGrowthOptions({
  mode = 'netto',
  costiAnnui = 0,
  quotaAgevolataPerc = 0,
  aliquotaAgevolata = 0.125,
  aliquotaOrdinaria = 0.26
} = {}) {
  const taxRate = calculateEffectiveTaxRate(quotaAgevolataPerc, aliquotaAgevolata, aliquotaOrdinaria);
  return {
    mode,
    costiAnnui: Math.min(Math.max(costiAnnui, 0), 1),
    quotaAgevolataPerc: Math.min(Math.max(quotaAgevolataPerc, 0), 1),
    taxRate
  };
}

export function calculatePacExitTax(montante, investimentoTotale, options = {}) {
  return montante - calculatePacExit(montante, investimentoTotale, options);
}
