import { FinancialModel } from '../models/FinancialModel.js';

const model = new FinancialModel();

self.addEventListener('message', (event) => {
  const { requestId, config } = event.data || {};
  if (!Number.isFinite(requestId) || !config) return;

  try {
    const results = model.calculateResults(config);
    self.postMessage({ requestId, results });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
