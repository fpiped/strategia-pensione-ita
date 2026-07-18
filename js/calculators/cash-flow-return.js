/**
 * Calcola il TIR annualizzato di una serie di flussi collocati nel tempo.
 * `time` e' espresso in anni e puo' essere frazionario: il motore resta quindi
 * valido anche per futuri versamenti anticipati, infrannuali o mensili.
 */
export function calculateAnnualizedIrr(events, options = {}) {
  const flows = events
    .map(({ time, amount }) => ({ time: Number(time), amount: Number(amount) }))
    .filter(({ time, amount }) => Number.isFinite(time) && time >= 0 && Number.isFinite(amount) && amount !== 0);

  if (!flows.some(({ amount }) => amount < 0) || !flows.some(({ amount }) => amount > 0)) return null;

  const npv = (rate) => flows.reduce(
    (total, { time, amount }) => total + amount / Math.pow(1 + rate, time),
    0
  );
  const tolerance = options.tolerance ?? 1e-10;
  let low = options.minRate ?? -0.999999;
  let high = options.initialMaxRate ?? 1;
  let lowValue = npv(low);
  let highValue = npv(high);

  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) return null;
  for (let attempt = 0; Math.sign(lowValue) === Math.sign(highValue) && attempt < 32; attempt++) {
    high = (high + 1) * 2 - 1;
    highValue = npv(high);
    if (!Number.isFinite(highValue)) return null;
  }
  if (Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let iteration = 0; iteration < 200; iteration++) {
    const middle = (low + high) / 2;
    const middleValue = npv(middle);
    if (Math.abs(middleValue) <= tolerance || high - low <= tolerance) return middle;
    if (Math.sign(middleValue) === Math.sign(lowValue)) {
      low = middle;
      lowValue = middleValue;
    } else {
      high = middle;
      highValue = middleValue;
    }
  }

  return (low + high) / 2;
}

/**
 * Convenzione attuale: spese a fine anno ed exit alla fine dell'ultimo anno.
 */
export function calculateStrategyIrr(results) {
  if (!results.length) return null;
  const events = results.map((row) => ({
    time: row.anno,
    amount: -(row.investimentoNetto ?? (row.quotaFpConsigliata + row.quotaPacConsigliata - row.risparmioFiscale))
  }));
  const last = results.at(-1);
  events.push({ time: last.anno, amount: last.exitOttimale });
  return calculateAnnualizedIrr(events);
}
