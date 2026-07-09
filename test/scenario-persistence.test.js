import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildShareUrl,
  decodeScenario,
  diffScenario,
  encodeScenario,
  sanitizeScenario
} from '../js/utils/scenario-persistence.js';

const DEFAULTS = {
  durata: 30,
  reddito: 30000,
  investimento: 5000,
  riscattoAnticipato: false,
  variazioneRedditoTipo: 'percentuale',
  variazioneRedditoValore: 2,
  comuneAddizionaliSearch: '',
  localTaxMode: 'manual',
  municipalityLabel: ''
};

test('diffScenario include solo le chiavi diverse dai predefiniti', () => {
  const diff = diffScenario(
    { ...DEFAULTS, durata: 40, riscattoAnticipato: true },
    DEFAULTS
  );

  assert.deepEqual(diff, { durata: 40, riscattoAnticipato: true });
});

test('encode/decode fanno roundtrip, anche con caratteri non ASCII', () => {
  const diff = {
    durata: 25,
    municipalityLabel: "Sant'Agata de' Goti (BN) — città"
  };

  const decoded = decodeScenario(encodeScenario(diff));

  assert.equal(decoded.v, 1);
  assert.equal(decoded.durata, 25);
  assert.equal(decoded.municipalityLabel, diff.municipalityLabel);
});

test("l'encoding è URL-safe (base64url senza padding)", () => {
  const encoded = encodeScenario({ municipalityLabel: 'àèìòù€' });

  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
});

test('decodeScenario rifiuta payload corrotti o di versione ignota', () => {
  assert.equal(decodeScenario('non-base64-!!!'), null);
  assert.equal(decodeScenario(''), null);
  assert.equal(decodeScenario(null), null);
  assert.equal(decodeScenario(encodeScenario({ v: 99 })), null);
});

test('sanitizeScenario scarta chiavi sconosciute e tipi sbagliati', () => {
  const patch = sanitizeScenario({
    durata: 40,
    chiaveInventata: 123,
    reddito: 'quarantamila',
    riscattoAnticipato: 'true',
    localTaxMode: 'qualcosaltro'
  }, DEFAULTS);

  assert.deepEqual(patch, { durata: 40 });
});

test('sanitizeScenario riporta i numeri nei limiti del campo', () => {
  const patch = sanitizeScenario({ durata: 5000, reddito: -100 }, DEFAULTS);

  assert.deepEqual(patch, { durata: 100, reddito: 0 });
});

test('sanitizeScenario valuta i limiti dinamici con il tipo già applicato', () => {
  // In euro il valore può superare 100; in percentuale viene riportato a 100.
  const inEuro = sanitizeScenario({
    variazioneRedditoTipo: 'euro',
    variazioneRedditoValore: 1500
  }, DEFAULTS);
  const inPercentuale = sanitizeScenario({
    variazioneRedditoValore: 1500
  }, DEFAULTS);

  assert.equal(inEuro.variazioneRedditoValore, 1500);
  assert.equal(inPercentuale.variazioneRedditoValore, 100);
});

test('sanitizeScenario restituisce null senza chiavi valide', () => {
  assert.equal(sanitizeScenario({ chiaveInventata: 1 }, DEFAULTS), null);
  assert.equal(sanitizeScenario('non un oggetto', DEFAULTS), null);
  assert.equal(sanitizeScenario(null, DEFAULTS), null);
});

test('buildShareUrl aggiunge il fragment solo se lo scenario differisce', () => {
  const base = 'https://strategiapensione.it/';

  const untouched = buildShareUrl({ ...DEFAULTS }, DEFAULTS, base);
  const modified = buildShareUrl({ ...DEFAULTS, durata: 40 }, DEFAULTS, base);

  assert.equal(untouched, base);
  const url = new URL(modified);
  assert.equal(url.search, '');
  assert.match(url.hash, /^#s=/);
  assert.deepEqual(decodeScenario(url.hash.slice(3)), { v: 1, durata: 40 });
});

test('buildShareUrl sostituisce un fragment già presente', () => {
  const base = 'https://strategiapensione.it/#sezione';

  const url = new URL(buildShareUrl({ ...DEFAULTS, durata: 40 }, DEFAULTS, base));

  assert.deepEqual(decodeScenario(url.hash.slice(3)), { v: 1, durata: 40 });
});

test('il roundtrip completo riproduce lo scenario di partenza', () => {
  const state = {
    ...DEFAULTS,
    durata: 42,
    investimento: 8000,
    riscattoAnticipato: true,
    localTaxMode: 'auto',
    municipalityLabel: 'Milano (MI)'
  };

  const encoded = encodeScenario(diffScenario(state, DEFAULTS));
  const patch = sanitizeScenario(decodeScenario(encoded), DEFAULTS);

  assert.deepEqual({ ...DEFAULTS, ...patch }, state);
});
