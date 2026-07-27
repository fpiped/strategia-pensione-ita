import { REGIONAL_TAX_2026 } from '../constants/regional-tax-data.js';
import {
  calculateLocalTaxAmount,
  normalizeLocalTaxRule
} from '../calculators/local-tax-calculator.js';

// I dati comunali (~700 KB) si caricano on demand: prima del load le
// funzioni sui comuni rispondono "nessun risultato" e chi ha richiesto
// il caricamento riallinea la UI alla risoluzione della promise.
let MUNICIPAL_TAX_2026 = [];
let municipalTaxDataPromise = null;

export function loadMunicipalTaxData() {
  if (!municipalTaxDataPromise) {
    municipalTaxDataPromise = import('../constants/local-tax-data.js')
      .then((module) => {
        MUNICIPAL_TAX_2026 = module.MUNICIPAL_TAX_2026;
      })
      .catch((error) => {
        // Rete assente o modulo non raggiungibile: si potrà ritentare.
        municipalTaxDataPromise = null;
        throw error;
      });
  }
  return municipalTaxDataPromise;
}

export function isMunicipalTaxDataLoaded() {
  return MUNICIPAL_TAX_2026.length > 0;
}

export function findRegionById(regionId) {
  return REGIONAL_TAX_2026.find((region) => region.id === regionId) || null;
}

export function findRegionByProvince(provinceCode) {
  return REGIONAL_TAX_2026.find((region) => region.provinceCodes.includes(provinceCode)) || null;
}

export function findMunicipalityByCode(municipalityCode) {
  return MUNICIPAL_TAX_2026.find((municipality) => municipality.code === municipalityCode) || null;
}

export function searchMunicipalities(query, limit = 20) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return MUNICIPAL_TAX_2026
    .map((municipality) => ({
      municipality,
      score: scoreMunicipality(municipality, normalizedQuery)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.municipality.name.localeCompare(b.municipality.name, 'it'))
    .slice(0, limit)
    .map((item) => item.municipality);
}

export function calculateLocalTaxRate({ reddito, regionId, municipalityCode }) {
  const taxableIncome = Math.max(reddito, 0);
  const { region, municipality, rules } = resolveLocalTaxRules({ regionId, municipalityCode });
  const [regionalRule, municipalRule] = rules;
  const regionalTax = calculateLocalTaxAmount(taxableIncome, regionalRule);
  const municipalTax = calculateLocalTaxAmount(taxableIncome, municipalRule);
  const regionalMarginalRate = calculateLocalTaxMarginalRate(taxableIncome, regionalRule);
  const municipalMarginalRate = calculateLocalTaxMarginalRate(taxableIncome, municipalRule);
  const regionalBreakdown = buildLocalTaxBreakdown(taxableIncome, regionalRule);
  const municipalBreakdown = buildLocalTaxBreakdown(taxableIncome, municipalRule);

  if (taxableIncome <= 0) {
    return {
      taxableIncome,
      regionalTax,
      municipalTax,
      totalRate: 0,
      regionalRate: 0,
      municipalRate: 0,
      regionalMarginalRate,
      municipalMarginalRate,
      regionalBreakdown,
      municipalBreakdown,
      region,
      municipality,
      rules
    };
  }

  return {
    taxableIncome,
    regionalTax,
    municipalTax,
    totalRate: (regionalTax + municipalTax) / taxableIncome,
    regionalRate: regionalTax / taxableIncome,
    municipalRate: municipalTax / taxableIncome,
    regionalMarginalRate,
    municipalMarginalRate,
    regionalBreakdown,
    municipalBreakdown,
    region,
    municipality,
    rules
  };
}

function calculateLocalTaxMarginalRate(taxableIncome, rule) {
  const income = Math.max(Number(taxableIncome) || 0, 0);
  if (!rule || income <= 0 || income <= (rule.exemption || 0)) return 0;
  if (Number.isFinite(rule.rate)) return Math.max(rule.rate, 0);
  return (rule.brackets || []).find((bracket) => income <= bracket.upTo)?.rate || 0;
}

function buildLocalTaxBreakdown(taxableIncome, rule) {
  const income = Math.max(Number(taxableIncome) || 0, 0);
  const exemption = Math.max(rule?.exemption || 0, 0);
  if (!rule || income <= 0) {
    return { exempt: false, exemption, slices: [] };
  }
  if (income <= exemption) {
    return { exempt: true, exemption, slices: [] };
  }
  if (Number.isFinite(rule.rate)) {
    return {
      exempt: false,
      exemption,
      slices: [{ taxableAmount: income, rate: Math.max(rule.rate, 0) }]
    };
  }

  let previousLimit = 0;
  const slices = [];
  for (const bracket of rule.brackets || []) {
    const upperLimit = Number.isFinite(bracket.upTo) ? bracket.upTo : Infinity;
    const taxableAmount = Math.max(Math.min(income, upperLimit) - previousLimit, 0);
    if (taxableAmount > 0) {
      slices.push({ taxableAmount, rate: Math.max(bracket.rate || 0, 0) });
    }
    previousLimit = upperLimit;
    if (income <= upperLimit) break;
  }
  return { exempt: false, exemption, slices };
}

export function resolveLocalTaxRules({ regionId, municipalityCode }) {
  const municipality = findMunicipalityByCode(municipalityCode);
  const forcedRegion = municipality ? findRegionByProvince(municipality.province) : null;
  const region = forcedRegion || findRegionById(regionId);
  return {
    region,
    municipality,
    // Mantiene due posizioni stabili: regionale e comunale. Le regole nulle
    // valgono zero e permettono alla UI di mostrare le due componenti.
    rules: [normalizeLocalTaxRule(region), normalizeLocalTaxRule(municipality)]
  };
}

function scoreMunicipality(municipality, query) {
  const name = normalizeSearchText(municipality.name);
  const province = normalizeSearchText(municipality.province);
  const code = normalizeSearchText(municipality.code);

  if (code === query) return 100;
  if (name === query) return 90;
  if (name.startsWith(query)) return 80;
  if (province === query) return 70;
  if (name.includes(query)) return 60;
  if (code.includes(query)) return 50;
  return 0;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
