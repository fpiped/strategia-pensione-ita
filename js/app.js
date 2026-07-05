import { FinancialController } from './controllers/FinancialController.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = new FinancialController();
  app.updateResults();
  // Risultati calcolati: sblocca il primo paint (vedi inline script nel head).
  requestAnimationFrame(() => {
    document.documentElement.removeAttribute('data-booting');
  });
});
