import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateLocalTaxRate,
  findMunicipalityByCode,
  findRegionByProvince,
  searchMunicipalities
} from '../js/utils/local-tax-helpers.js';

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

test('calcola aliquota effettiva da scaglioni regionali e comunali', () => {
  const result = calculateLocalTaxRate({
    reddito: 30000,
    regionId: 'piemonte',
    municipalityCode: 'L219'
  });

  assert.equal(result.region.name, 'Piemonte');
  assert.equal(result.municipality.name, 'Torino');
  assert.equal(Number((result.regionalRate * 100).toFixed(2)), 2.19);
  assert.equal(Number((result.municipalRate * 100).toFixed(2)), 0.82);
  assert.equal(Number((result.totalRate * 100).toFixed(2)), 3.01);
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
