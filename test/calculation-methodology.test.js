import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALCULATION_METHODS,
  CALCULATION_METHODOLOGY_VERSION,
  createCalculationAudit,
  resolveCalculationMethod
} from '../js/constants/calculation-methodology.js';
import { CURRENT_FISCAL_RULES } from '../js/constants/fiscal-rules.js';

test('ogni metodo di calcolo documenta decisione, formula, motivo, fonti e approssimazioni', () => {
  assert.ok(CALCULATION_METHODOLOGY_VERSION);
  assert.ok(CALCULATION_METHODS.length >= 15);

  const ids = new Set();
  const fiscalSourceIds = new Set(CURRENT_FISCAL_RULES.documentation.map((item) => item.id));
  for (const method of CALCULATION_METHODS) {
    assert.ok(method.id && !ids.has(method.id), `ID duplicato o assente: ${method.id}`);
    ids.add(method.id);
    assert.ok(method.area);
    assert.ok(method.title);
    assert.ok(method.decision);
    assert.ok(method.formula);
    assert.ok(method.rationale);
    assert.ok(Array.isArray(method.sourceRuleIds));
    assert.ok(Array.isArray(method.approximations));
    assert.ok(Array.isArray(method.implementation) && method.implementation.length > 0);
    method.sourceRuleIds.forEach((sourceId) => {
      assert.ok(fiscalSourceIds.has(sourceId), `${method.id}: fonte sconosciuta ${sourceId}`);
    });
  }
});

test('risolve le fonti senza duplicarle nel registro metodologico', () => {
  const resolved = resolveCalculationMethod('tax.inps');
  assert.deepEqual(resolved.sources.map((source) => source.id), [
    'inpsRate',
    'inpsCeiling',
    'additionalIvs'
  ]);
});

test('la traccia rifiuta riferimenti metodologici inesistenti', () => {
  const audit = createCalculationAudit(['budget.net-identity'], { budget: 3000 });
  assert.equal(audit.methodologyVersion, CALCULATION_METHODOLOGY_VERSION);
  assert.deepEqual(audit.methodologyIds, ['budget.net-identity']);
  assert.equal(audit.values.budget, 3000);
  assert.throws(
    () => createCalculationAudit(['metodo.inesistente']),
    /Metodologia sconosciuta/
  );
});
