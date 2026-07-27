import assert from 'node:assert/strict';
import test from 'node:test';

import { FinancialModel } from '../js/models/FinancialModel.js';
import { CalculationService } from '../js/utils/calculation-service.js';

class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.terminated = false;
    this.message = null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  postMessage(message) {
    this.message = message;
  }

  terminate() {
    this.terminated = true;
  }

  emit(type, data = null) {
    this.listeners.get(type)?.(type === 'message' ? { data } : {});
  }
}

test('annulla il calcolo precedente e accetta soltanto il risultato più recente', async () => {
  const workers = [];
  const service = new CalculationService({
    calculateSync: (config) => ({ value: config.value }),
    workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }
  });

  const first = service.calculate({ value: 1 });
  const firstRequest = workers[0].message.requestId;
  const second = service.calculate({ value: 2 });
  const secondRequest = workers[1].message.requestId;

  assert.equal(workers[0].terminated, true);
  assert.deepEqual(await first, { status: 'cancelled' });

  workers[0].emit('message', {
    requestId: firstRequest,
    results: { value: 1 }
  });
  workers[1].emit('message', {
    requestId: secondRequest,
    results: { value: 2 }
  });

  assert.deepEqual(await second, {
    status: 'completed',
    results: { value: 2 },
    execution: 'worker'
  });
  assert.equal(workers[1].terminated, true);
});

test('invalidate termina il worker senza lasciare una promessa pendente', async () => {
  const worker = new FakeWorker();
  const service = new CalculationService({
    calculateSync: () => null,
    workerFactory: () => worker
  });

  const pending = service.calculate({});
  service.invalidate();

  assert.equal(worker.terminated, true);
  assert.deepEqual(await pending, { status: 'cancelled' });
});

test('ripiega sul calcolo sincrono se il worker non può essere creato', async () => {
  const service = new CalculationService({
    calculateSync: (config) => ({ doubled: config.value * 2 }),
    workerFactory: () => {
      throw new Error('worker unavailable');
    }
  });

  assert.deepEqual(await service.calculate({ value: 4 }), {
    status: 'completed',
    results: { doubled: 8 },
    execution: 'main-thread'
  });
});

test('il worker restituisce lo stesso risultato serializzabile del modello', async () => {
  let messageHandler = null;
  let postedMessage = null;
  globalThis.self = {
    addEventListener(type, handler) {
      if (type === 'message') messageHandler = handler;
    },
    postMessage(message) {
      postedMessage = structuredClone(message);
    }
  };

  try {
    await import('../js/workers/calculation-worker.js');
    const config = {
      durata: 2,
      reddito: 35000,
      investimento: 3000,
      quotaDatoreFpPerc: 0.015,
      quotaMinAderentePerc: 0.01,
      rendimentoAnnualeFpPerc: 0.03,
      rendimentoAnnualePacPerc: 0.06,
      modalitaCumulativa: true,
      riscattoAnticipato: false
    };
    const expected = new FinancialModel().calculateResults(config);

    messageHandler({ data: { requestId: 42, config } });

    assert.equal(postedMessage.requestId, 42);
    assert.deepEqual(postedMessage.results, expected);
  } finally {
    delete globalThis.self;
  }
});
