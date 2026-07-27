function defaultWorkerFactory() {
  if (typeof Worker === 'undefined') return null;
  return () => new Worker(
    new URL('../workers/calculation-worker.js', import.meta.url),
    { type: 'module' }
  );
}

/**
 * Esegue il modello fuori dal thread UI quando i Web Worker sono disponibili.
 *
 * Ogni richiesta usa un worker dedicato: in questo modo una nuova modifica può
 * terminare davvero un calcolo ormai superato, invece di accodarsi dietro di
 * esso. Il fallback sincrono conserva il funzionamento sui browser senza
 * supporto ai module worker.
 */
export class CalculationService {
  constructor({ calculateSync, workerFactory = defaultWorkerFactory() }) {
    if (typeof calculateSync !== 'function') {
      throw new TypeError('calculateSync deve essere una funzione');
    }
    this.calculateSync = calculateSync;
    this.workerFactory = workerFactory;
    this.sequence = 0;
    this.active = null;
  }

  invalidate() {
    this.sequence += 1;
    this.cancelActive();
  }

  cancelActive() {
    if (!this.active) return;
    const { worker, resolve } = this.active;
    this.active = null;
    worker.terminate();
    resolve({ status: 'cancelled' });
  }

  calculate(config) {
    this.cancelActive();
    const requestId = ++this.sequence;

    if (!this.workerFactory) {
      return Promise.resolve({
        status: 'completed',
        results: this.calculateSync(config),
        execution: 'main-thread'
      });
    }

    let worker;
    try {
      worker = this.workerFactory();
    } catch {
      this.workerFactory = null;
      return Promise.resolve({
        status: 'completed',
        results: this.calculateSync(config),
        execution: 'main-thread'
      });
    }

    return new Promise((resolve, reject) => {
      this.active = { requestId, worker, resolve, reject };

      worker.addEventListener('message', (event) => {
        if (!this.active || this.active.requestId !== requestId) return;
        const payload = event.data || {};
        if (payload.requestId !== requestId) return;

        this.active = null;
        worker.terminate();
        if (payload.error) {
          reject(new Error(payload.error));
          return;
        }
        resolve({
          status: 'completed',
          results: payload.results,
          execution: 'worker'
        });
      });

      worker.addEventListener('error', () => {
        if (!this.active || this.active.requestId !== requestId) return;
        this.active = null;
        worker.terminate();
        // Un worker non avviabile non deve rendere inutilizzabile il sito.
        // Dopo il primo errore si resta sul percorso sincrono compatibile.
        this.workerFactory = null;
        try {
          resolve({
            status: 'completed',
            results: this.calculateSync(config),
            execution: 'main-thread'
          });
        } catch (error) {
          reject(error);
        }
      });

      worker.postMessage({ requestId, config });
    });
  }
}
