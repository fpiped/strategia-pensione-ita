import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

test('set applica la patch e notifica i subscriber', () => {
  const store = createStore({ reddito: 30000, durata: 30 });
  const seen = [];
  store.subscribe((state) => seen.push({ ...state }));

  const changed = store.set({ reddito: 35000 });

  assert.equal(changed, true);
  assert.equal(store.get().reddito, 35000);
  assert.equal(store.get().durata, 30);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].reddito, 35000);
});

test('set con valori identici non notifica', () => {
  const store = createStore({ reddito: 30000 });
  let calls = 0;
  store.subscribe(() => calls += 1);

  const changed = store.set({ reddito: 30000 });

  assert.equal(changed, false);
  assert.equal(calls, 0);
});

test('set vuoto non notifica', () => {
  const store = createStore({ a: 1 });
  let calls = 0;
  store.subscribe(() => calls += 1);

  assert.equal(store.set({}), false);
  assert.equal(calls, 0);
});

test('unsubscribe rimuove il listener', () => {
  const store = createStore({ a: 1 });
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls += 1);

  store.set({ a: 2 });
  unsubscribe();
  store.set({ a: 3 });

  assert.equal(calls, 1);
});

test('set dentro un listener accoda una nuova notifica invece di annidarla', () => {
  const store = createStore({ valore: 5, valoreDerivato: 0 });
  const passes = [];
  // Simula un valore derivato riscritto nello store da un subscriber
  // (es. aliquota addizionali in modalità auto).
  store.subscribe((state) => {
    if (state.valoreDerivato !== state.valore * 2) {
      store.set({ valoreDerivato: state.valore * 2 });
    }
  });
  store.subscribe((state) => passes.push(state.valoreDerivato));

  store.set({ valore: 10 });

  assert.equal(store.get().valoreDerivato, 20);
  // Due passaggi: quello con la patch e quello di convergenza.
  assert.deepEqual(passes, [20, 20]);
});

test('la notifica converge quando i listener non cambiano più lo stato', () => {
  const store = createStore({ a: 0 });
  let calls = 0;
  store.subscribe(() => {
    calls += 1;
    assert.ok(calls < 50, 'notifica non convergente');
  });

  store.set({ a: 1 });

  assert.ok(calls <= 2);
});
