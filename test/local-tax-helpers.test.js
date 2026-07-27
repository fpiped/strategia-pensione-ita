import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateLocalTaxRate,
  findMunicipalityByCode,
  findRegionByProvince,
  loadMunicipalTaxData,
  searchMunicipalities
} from '../js/utils/local-tax-helpers.js';

// I dati comunali sono lazy: nei test vanno caricati prima di tutto.
await loadMunicipalTaxData();

test('forza la regione dalla provincia del comune selezionato', () => {
  const result = calculateLocalTaxRate({
    reddito: 30000,
    regionId: 'lazio',
    municipalityCode: 'F205'
  });

  assert.equal(result.municipality.name, 'Milano');
  assert.equal(result.region.name, 'Lombardia');
});

test('calcola addizionale comunale nulla sotto esenzione', () => {
  const result = calculateLocalTaxRate({
    reddito: 12000,
    regionId: 'lombardia',
    municipalityCode: 'F205'
  });

  assert.equal(result.municipalRate, 0);
  assert.ok(result.regionalRate > 0);
});

test('distingue media e marginale per il caso Lombardia e Milano mostrato in UI', () => {
  const result = calculateLocalTaxRate({
    reddito: 31783.5,
    regionId: 'lombardia',
    municipalityCode: 'F205'
  });

  assert.equal(Number((result.regionalRate * 100).toFixed(2)), 1.43);
  assert.equal(Number((result.regionalMarginalRate * 100).toFixed(2)), 1.72);
  assert.equal(Number((result.municipalRate * 100).toFixed(2)), 0.8);
  assert.equal(Number((result.municipalMarginalRate * 100).toFixed(2)), 0.8);
  assert.deepEqual(result.regionalBreakdown.slices, [
    { taxableAmount: 15000, rate: 0.0123 },
    { taxableAmount: 13000, rate: 0.0158 },
    { taxableAmount: 3783.5, rate: 0.0172 }
  ]);
  assert.deepEqual(result.municipalBreakdown.slices, [
    { taxableAmount: 31783.5, rate: 0.008 }
  ]);
});

test('calcola aliquota effettiva da scaglioni regionali e comunali', () => {
  const result = calculateLocalTaxRate({
    reddito: 30000,
    regionId: 'piemonte',
    municipalityCode: 'L219'
  });

  assert.equal(result.region.name, 'Piemonte');
  assert.equal(result.municipality.name, 'Torino');
  assert.equal(result.taxableIncome, 30000);
  assert.equal(Number((result.regionalRate * 100).toFixed(2)), 2.19);
  assert.equal(Number((result.municipalRate * 100).toFixed(2)), 0.82);
  assert.equal(Number((result.totalRate * 100).toFixed(2)), 3.01);
  assert.equal(Number((result.regionalMarginalRate * 100).toFixed(2)), 3.31);
  assert.equal(Number((result.municipalMarginalRate * 100).toFixed(2)), 1.1);
});

test('risolve regione da provincia e comune da codice catastale', () => {
  assert.equal(findRegionByProvince('RM').name, 'Lazio');
  assert.equal(findMunicipalityByCode('H501').name, 'Roma');
});

test('cerca comuni per nome, provincia e codice catastale', () => {
  assert.equal(searchMunicipalities('milano')[0].code, 'F205');
  assert.ok(searchMunicipalities('rm').every((municipality) => municipality.province === 'RM'));
  assert.equal(searchMunicipalities('H501')[0].name, 'Roma');
  assert.equal(searchMunicipalities('zzzzzz').length, 0);
});
