const IRPEF_BRACKET_LIMITS = [15000, 28000, 50000, Infinity];

/**
 * Converte una regola del dataset MEF (aliquote espresse in percentuale)
 * nella rappresentazione interna comune (aliquote in frazione).
 */
export function normalizeLocalTaxRule(rule) {
  if (!rule) return null;

  const normalized = {
    exemption: Math.max(Number(rule.exemption) || 0, 0)
  };

  if (Number.isFinite(rule.rate)) {
    normalized.rate = Math.max(rule.rate, 0) / 100;
    return normalized;
  }

  const brackets = Array.isArray(rule.brackets) ? rule.brackets : [];
  normalized.brackets = brackets.map((bracket, index) => {
    if (typeof bracket === 'number') {
      return {
        upTo: IRPEF_BRACKET_LIMITS[index] ?? Infinity,
        rate: Math.max(bracket, 0) / 100
      };
    }
    return {
      upTo: Number.isFinite(bracket?.upTo) ? Math.max(bracket.upTo, 0) : Infinity,
      rate: Math.max(Number(bracket?.rate) || 0, 0) / 100
    };
  });
  return normalized;
}

/** La modalità manuale è una singola aliquota piatta, senza esenzioni. */
export function createFlatLocalTaxRules(rate = 0) {
  const safeRate = Math.max(Number(rate) || 0, 0);
  return safeRate > 0 ? [{ exemption: 0, rate: safeRate }] : [];
}

/** Calcola l'importo dovuto per una singola regola già normalizzata. */
export function calculateLocalTaxAmount(taxableIncome, rule) {
  const income = Math.max(Number(taxableIncome) || 0, 0);
  if (!rule || income <= 0 || income <= (rule.exemption || 0)) return 0;
  if (Number.isFinite(rule.rate)) return income * Math.max(rule.rate, 0);

  let tax = 0;
  let previousLimit = 0;
  for (const bracket of rule.brackets || []) {
    const upperLimit = Number.isFinite(bracket.upTo) ? bracket.upTo : Infinity;
    const taxableSlice = Math.max(Math.min(income, upperLimit) - previousLimit, 0);
    tax += taxableSlice * Math.max(bracket.rate || 0, 0);
    previousLimit = upperLimit;
    if (income <= upperLimit) break;
  }
  return tax;
}

/** Somma regionale e comunale, oppure la sola regola piatta manuale. */
export function calculateLocalTaxes(taxableIncome, rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .reduce((total, rule) => total + calculateLocalTaxAmount(taxableIncome, rule), 0);
}
