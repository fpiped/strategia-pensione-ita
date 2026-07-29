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

/**
 * Scompone una singola addizionale nelle stesse quote usate dal calcolo.
 * La view può così mostrare una riconciliazione esatta senza replicare la
 * logica fiscale.
 */
export function calculateLocalTaxBreakdown(taxableIncome, rule) {
  const income = Math.max(Number(taxableIncome) || 0, 0);
  const exemption = Math.max(rule?.exemption || 0, 0);
  if (!rule || income <= 0) {
    return { taxableIncome: income, exemption, exempt: false, slices: [], total: 0 };
  }
  if (income <= exemption) {
    return { taxableIncome: income, exemption, exempt: true, slices: [], total: 0 };
  }
  if (Number.isFinite(rule.rate)) {
    const rate = Math.max(rule.rate, 0);
    return {
      taxableIncome: income,
      exemption,
      exempt: false,
      slices: [{ taxableAmount: income, rate, tax: income * rate }],
      total: income * rate
    };
  }

  let total = 0;
  let previousLimit = 0;
  const slices = [];
  for (const bracket of rule.brackets || []) {
    const upperLimit = Number.isFinite(bracket.upTo) ? bracket.upTo : Infinity;
    const taxableSlice = Math.max(Math.min(income, upperLimit) - previousLimit, 0);
    const rate = Math.max(bracket.rate || 0, 0);
    const tax = taxableSlice * rate;
    if (taxableSlice > 0) {
      slices.push({ taxableAmount: taxableSlice, rate, tax });
    }
    total += tax;
    previousLimit = upperLimit;
    if (income <= upperLimit) break;
  }
  return { taxableIncome: income, exemption, exempt: false, slices, total };
}

/** Calcola l'importo dovuto per una singola regola già normalizzata. */
export function calculateLocalTaxAmount(taxableIncome, rule) {
  return calculateLocalTaxBreakdown(taxableIncome, rule).total;
}

/** Somma regionale e comunale, oppure la sola regola piatta manuale. */
export function calculateLocalTaxes(taxableIncome, rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .reduce((total, rule) => total + calculateLocalTaxAmount(taxableIncome, rule), 0);
}
