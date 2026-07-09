import { REGIONAL_TAX_2026 } from '../constants/regional-tax-data.js';

const IRPEF_BRACKET_LIMITS = [15000, 28000, 50000, Infinity];

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
  const municipality = findMunicipalityByCode(municipalityCode);
  const forcedRegion = municipality ? findRegionByProvince(municipality.province) : null;
  const region = forcedRegion || findRegionById(regionId);
  const regionalTax = calculateTaxAmount(taxableIncome, region);
  const municipalTax = calculateTaxAmount(taxableIncome, municipality);

  if (taxableIncome <= 0) {
    return {
      totalRate: 0,
      regionalRate: 0,
      municipalRate: 0,
      region,
      municipality
    };
  }

  return {
    totalRate: (regionalTax + municipalTax) / taxableIncome,
    regionalRate: regionalTax / taxableIncome,
    municipalRate: municipalTax / taxableIncome,
    region,
    municipality
  };
}

function calculateTaxAmount(taxableIncome, taxRule) {
  if (!taxRule || taxableIncome <= 0) return 0;
  if (taxRule.exemption && taxableIncome <= taxRule.exemption) return 0;
  if (Number.isFinite(taxRule.rate)) return taxableIncome * taxRule.rate / 100;

  const brackets = normalizeBrackets(taxRule.brackets);
  let tax = 0;
  let previousLimit = 0;

  for (const bracket of brackets) {
    const taxableSlice = Math.max(Math.min(taxableIncome, bracket.upTo) - previousLimit, 0);
    tax += taxableSlice * bracket.rate / 100;
    previousLimit = bracket.upTo;
    if (taxableIncome <= bracket.upTo) break;
  }

  return tax;
}

function normalizeBrackets(brackets = []) {
  if (!brackets.length) return [];
  if (typeof brackets[0] === 'number') {
    return brackets.map((rate, index) => ({
      upTo: IRPEF_BRACKET_LIMITS[index] ?? Infinity,
      rate
    }));
  }
  return brackets;
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
