import assert from 'node:assert/strict';
import test from 'node:test';

import { MUNICIPAL_TAX_2026 } from '../js/constants/local-tax-data.js';

const IRPEF_BRACKET_LIMITS = new Set([15000, 28000, 50000]);

test('il dataset comunale ha codici univoci e regole strutturalmente valide', () => {
  const codes = new Set();

  for (const municipality of MUNICIPAL_TAX_2026) {
    assert.ok(!codes.has(municipality.code), `Codice duplicato: ${municipality.code}`);
    codes.add(municipality.code);

    assert.ok(
      Number.isFinite(municipality.rate) || municipality.brackets?.length > 0,
      `Regola assente: ${municipality.code} ${municipality.name}`
    );
    assert.ok(
      !Number.isFinite(municipality.exemption) || municipality.exemption >= 0,
      `Esenzione non valida: ${municipality.code} ${municipality.name}`
    );

    if (!municipality.brackets) continue;

    let previousLimit = 0;
    municipality.brackets.forEach((bracket, index) => {
      const isLast = index === municipality.brackets.length - 1;
      assert.ok(
        bracket.upTo === Infinity || IRPEF_BRACKET_LIMITS.has(bracket.upTo),
        `Soglia inattesa ${bracket.upTo}: ${municipality.code} ${municipality.name}`
      );
      assert.ok(
        bracket.upTo > previousLimit,
        `Soglie non crescenti: ${municipality.code} ${municipality.name}`
      );
      assert.ok(
        Number.isFinite(bracket.rate) && bracket.rate >= 0,
        `Aliquota non valida: ${municipality.code} ${municipality.name}`
      );
      if (!isLast) {
        assert.notEqual(
          bracket.upTo,
          Infinity,
          `Copertura infinita prima dell’ultimo scaglione: ${municipality.code} ${municipality.name}`
        );
      }
      previousLimit = bracket.upTo;
    });

    assert.equal(
      municipality.brackets.at(-1).upTo,
      Infinity,
      `Ultimo scaglione non illimitato: ${municipality.code} ${municipality.name}`
    );
  }
});

test('mantiene le correzioni verificate sul portale del Dipartimento delle Finanze', () => {
  const byCode = new Map(MUNICIPAL_TAX_2026.map((municipality) => [municipality.code, municipality]));

  assert.deepEqual(byCode.get('A264'), {
    code: 'A264',
    name: 'Ameno',
    province: 'NO',
    brackets: [
      { upTo: 15000, rate: 0.2 },
      { upTo: 28000, rate: 0.4 },
      { upTo: 50000, rate: 0.6 },
      { upTo: Infinity, rate: 0.8 }
    ],
    exemption: 12000
  });
  assert.deepEqual(byCode.get('A591'), {
    code: 'A591',
    name: 'Baldissero Torinese',
    province: 'TO',
    brackets: [
      { upTo: 15000, rate: 0.5 },
      { upTo: 28000, rate: 0.6 },
      { upTo: 50000, rate: 0.75 },
      { upTo: Infinity, rate: 0.8 }
    ],
    exemption: 10000
  });
  assert.deepEqual(byCode.get('B920'), {
    code: 'B920',
    name: 'Casalvolone',
    province: 'NO',
    brackets: [
      { upTo: 15000, rate: 0.34 },
      { upTo: 28000, rate: 0.35 },
      { upTo: 50000, rate: 0.4 },
      { upTo: Infinity, rate: 0.75 }
    ],
    exemption: 12000
  });
  assert.deepEqual(byCode.get('D317'), {
    code: 'D317',
    name: "Dolce'",
    province: 'VR',
    brackets: [
      { upTo: 15000, rate: 0.7 },
      { upTo: 28000, rate: 0.72 },
      { upTo: 50000, rate: 0.78 },
      { upTo: Infinity, rate: 0.8 }
    ],
    exemption: 15000
  });
  assert.deepEqual(byCode.get('E514'), {
    code: 'E514',
    name: 'Legnano',
    province: 'MI',
    brackets: [
      { upTo: 15000, rate: 0.6 },
      { upTo: 28000, rate: 0.65 },
      { upTo: 50000, rate: 0.7 },
      { upTo: Infinity, rate: 0.8 }
    ],
    exemption: 15000
  });
  assert.deepEqual(byCode.get('E751')?.brackets, [
    { upTo: 15000, rate: 0.6 },
    { upTo: 28000, rate: 0.65 },
    { upTo: 50000, rate: 0.7 },
    { upTo: Infinity, rate: 0.75 }
  ]);
  assert.deepEqual(byCode.get('E819'), {
    code: 'E819',
    name: 'Magnago',
    province: 'MI',
    rate: 0.8,
    exemption: 12000
  });
  assert.deepEqual(byCode.get('G935')?.brackets, [
    { upTo: 15000, rate: 0.4 },
    { upTo: 28000, rate: 0.74 },
    { upTo: 50000, rate: 0.76 },
    { upTo: Infinity, rate: 0.8 }
  ]);
  assert.deepEqual(byCode.get('L039')?.brackets, [
    { upTo: 15000, rate: 0.3 },
    { upTo: 28000, rate: 0.5 },
    { upTo: 50000, rate: 0.7 },
    { upTo: Infinity, rate: 0.8 }
  ]);
});
