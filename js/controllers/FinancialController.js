import { FinancialModel } from '../models/FinancialModel.js';
import { FinancialView } from '../views/FinancialView.js';
import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';
import { REGIONAL_TAX_2026 } from '../constants/local-tax-data.js';
import {
  calculateLocalTaxRate,
  findMunicipalityByCode,
  searchMunicipalities
} from '../utils/local-tax-helpers.js';
import {
  buildInputWarnings
} from '../utils/input-helpers.js';

/**
 * FinancialController - Gestisce gli eventi e collega model e view
 */
export class FinancialController {
    constructor() {
        this.model = new FinancialModel();
        this.view = new FinancialView();
        this.tableView = 'mix';
        // Strategia mostrata in tabella ed esploratore: mix | fp | pac.
        this.strategyView = 'mix';
        this.latestResults = null;
        this.localTaxMode = 'manual';
        this.selectedMunicipalityLabel = '';
        this.guidedTaxMode = 'manual';
        this.selectedGuidedMunicipalityLabel = '';
        this.guidedStep = 0;
        this.annualExplorerYear = 1;
        this.updateResultsTimer = null;
        this.initEventListeners();
      }
  
    /**
     * Inizializza tutti gli event listener
     */
    initEventListeners() {
      this.initMoneyBounds();
      this.initVariationBounds();
      this.initLiveClamps();
      document.getElementById('input-form').addEventListener('input', (event) => {
        this.syncGuidedFieldsFromForm();
        if (event.target?.type === 'number') {
          this.scheduleResultsUpdate(200);
          return;
        }
        this.updateResults();
      });
      document.getElementById('input-form').addEventListener('change', (event) => {
        if (event.target?.matches('.native-select')) {
          this.syncSegmentedControl(event.target.id);
        }
        this.syncVariationFields();
        this.syncGuidedFieldsFromForm();
        this.updateResults();
      }); // Per checkbox
      document.querySelectorAll('[data-select-target]').forEach((button) => {
        button.addEventListener('click', () => {
          const select = document.getElementById(button.dataset.selectTarget);
          if (!select) return;
          select.value = button.dataset.selectValue;
          this.syncSegmentedControl(select.id);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      document.getElementById("download-csv").addEventListener("click", () => this.downloadCsv());
      document.getElementById('open-guided-mode').addEventListener('click', () => this.openGuidedMode());
      const annualExplorerSelect = document.getElementById('annual-explorer-year');
      annualExplorerSelect?.addEventListener('change', (event) => {
        event.stopPropagation();
        this.annualExplorerYear = parseInt(event.target.value, 10) || 1;
        if (this.latestResults?.config) {
          this.view.updateAnnualExplorer(this.getStrategyRows(), this.latestResults.config, this.annualExplorerYear);
        }
        this.view.highlightTableYear(this.annualExplorerYear);
      });
      document.getElementById('grid-div')?.addEventListener('click', (event) => {
        const row = event.target.closest('tr[data-anno]');
        if (!row) return;
        const year = parseInt(row.dataset.anno, 10);
        if (!Number.isFinite(year)) return;
        this.annualExplorerYear = year;
        const yearSelect = document.getElementById('annual-explorer-year');
        if (yearSelect) yearSelect.value = String(year);
        if (this.latestResults?.config) {
          this.view.updateAnnualExplorer(this.getStrategyRows(), this.latestResults.config, year);
        }
        this.view.highlightTableYear(year);
      });
      document.querySelectorAll('[data-guided-close]').forEach((element) => {
        element.addEventListener('click', () => this.closeGuidedMode());
      });
      document.getElementById('guided-prev').addEventListener('click', () => this.setGuidedStep(this.guidedStep - 1));
      document.getElementById('guided-next').addEventListener('click', () => {
        // "Avanti" applica subito i parametri al pannello: se la guidata viene
        // chiusa a metà, gli step già confermati restano inseriti.
        this.commitGuidedFieldsToForm();
        this.setGuidedStep(this.guidedStep + 1);
      });
      document.getElementById('guided-finish').addEventListener('click', () => this.applyGuidedMode());
      document.querySelectorAll('input[name^="guided-variazione-"]').forEach((input) => {
        input.addEventListener('change', () => {
          this.syncVariationFields();
          this.updateGuidedContributionPreview();
        });
      });
      document.querySelectorAll('[data-guided-tax-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setGuidedTaxMode(button.dataset.guidedTaxMode, { clearLocation: button.dataset.guidedTaxMode === 'manual' });
        });
      });
      document.getElementById('guided-regione-addizionali').addEventListener('change', () => {
        this.setGuidedTaxMode('auto');
        this.clearGuidedMunicipalitySelection();
        this.updateGuidedLocalTaxFields();
      });
      document.getElementById('guided-comune-addizionali-search').addEventListener('input', (event) => {
        this.setGuidedTaxMode('auto');
        if (event.target.value !== this.selectedGuidedMunicipalityLabel) {
          document.getElementById('guided-comune-addizionali').value = '';
        }
        this.renderGuidedMunicipalitySuggestions(event.target.value);
        this.updateGuidedLocalTaxFields();
      });
      document.getElementById('guided-comune-addizionali-search').addEventListener('focus', (event) => {
        this.renderGuidedMunicipalitySuggestions(event.target.value);
      });
      document.querySelectorAll('[id^="guided-"]').forEach((input) => {
        input.addEventListener('input', () => {
          this.updateGuidedContributionBaseFields();
          this.updateGuidedFirstEmploymentFields();
          this.updateGuidedContributionPreview();
          this.updateGuidedLocalTaxFields();
          this.updateGuidedReturnFields();
          // Specchio live: ogni modifica in guidata arriva subito al pannello.
          window.clearTimeout(this.guidedCommitTimer);
          this.guidedCommitTimer = window.setTimeout(() => this.commitGuidedFieldsToForm(), 250);
        });
        input.addEventListener('change', () => {
          this.syncVariationFields();
          this.updateGuidedContributionBaseFields();
          this.updateGuidedFirstEmploymentFields();
          this.updateGuidedContributionPreview();
          this.updateGuidedLocalTaxFields();
          this.updateGuidedReturnFields();
          window.clearTimeout(this.guidedCommitTimer);
          this.commitGuidedFieldsToForm();
        });
      });
      document.getElementById('primaOccupazionePost2006').addEventListener('change', () => {
        this.updateFirstEmploymentFields();
        this.updateResults();
      });
      document.getElementById('anzianitaPregressaFp').addEventListener('input', () => {
        this.updateFirstEmploymentFields();
      });
      document.getElementById('baseContributivaFpTipo').addEventListener('change', () => {
        this.updateContributionBaseFields();
        this.updateResults();
      });
      document.getElementById('baseDatoreFpTipo').addEventListener('change', () => {
        this.updateContributionBaseFields();
        this.updateResults();
      });
      document.getElementById('minimoRetributivoAnnuo').addEventListener('input', () => {
        this.updateContributionBaseFields();
        this.scheduleResultsUpdate(200);
      });
      document.getElementById('guided-rendimento-fp-mode').addEventListener('change', () => this.updateGuidedReturnFields());
      document.getElementById('guided-rendimento-pac-mode').addEventListener('change', () => this.updateGuidedReturnFields());
      document.getElementById('reddito').addEventListener('input', () => {
        this.updateContributionBaseFields();
        this.updateLocalTaxFields();
      });
      document.getElementById('premiStraordinari').addEventListener('input', () => {
        this.updateLocalTaxFields();
      });
      document.getElementById('altriRedditi').addEventListener('input', () => {
        this.updateLocalTaxFields();
      });
      document.querySelectorAll('[data-local-tax-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setLocalTaxMode(button.dataset.localTaxMode, { clearLocation: button.dataset.localTaxMode === 'manual' });
          this.syncGuidedFieldsFromForm();
          this.updateResults();
        });
      });
      document.getElementById('regioneAddizionali').addEventListener('change', () => {
        this.setLocalTaxMode('auto');
        this.clearMunicipalitySelection();
        this.updateLocalTaxFields();
      });
      document.getElementById('comuneAddizionaliSearch').addEventListener('input', (event) => {
        this.setLocalTaxMode('auto');
        if (event.target.value !== this.selectedMunicipalityLabel) {
          document.getElementById('comuneAddizionali').value = '';
        }
        this.renderMunicipalitySuggestions(event.target.value);
        this.updateLocalTaxFields();
      });
      document.getElementById('comuneAddizionaliSearch').addEventListener('focus', (event) => {
        this.renderMunicipalitySuggestions(event.target.value);
      });
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.autocomplete-group')) {
          this.hideMunicipalitySuggestions();
          this.hideGuidedMunicipalitySuggestions();
        }
      });
      document.querySelectorAll('[data-strategy-select]').forEach((button) => {
        button.addEventListener('click', () => this.setStrategyView(button.dataset.strategySelect));
      });
      document.querySelectorAll('[data-strategy]').forEach((card) => {
        const select = () => this.setStrategyView(card.dataset.strategy);
        card.addEventListener('click', select);
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select();
          }
        });
      });
      this.syncStrategyCards();
      document.querySelectorAll('[data-table-view]').forEach((button) => {
        button.addEventListener('click', () => {
          this.tableView = button.dataset.tableView;
          document.querySelectorAll('[data-table-view]').forEach((item) => {
            item.classList.toggle('active', item === button);
          });
          if (this.latestResults) {
            this.view.createTable(this.getStrategyRows(), this.tableView, this.getStrategyExitLabel());
            this.view.highlightTableYear(this.annualExplorerYear);
          }
        });
      });

      document.getElementById('rendimentoFpMode').addEventListener('change', () => this.updateResults());
      document.getElementById('rendimentoPacMode').addEventListener('change', () => this.updateResults());
      this.populateLocalTaxSelectors();
      this.populateGuidedLocalTaxSelectors();
      this.setLocalTaxMode(this.localTaxMode);
      this.setGuidedTaxMode(this.guidedTaxMode);
      this.updateFirstEmploymentFields();
      this.updateContributionBaseFields();
      this.updateGuidedContributionBaseFields();
      this.updateLocalTaxFields();
      this.updateEffectiveTaxOutputs();
      this.initVariationStates();
      this.syncSegmentedControls();
      // Al load la guidata è allineata al pannello: nessun valore vecchio
      // (anche se il browser ripristina i campi del modale).
      this.syncGuidedFieldsFromForm();
    }

    // Importi in EUR forzati nell'intervallo 0-1.000.000; campo svuotato -> 0.
    static CLAMPED_MONEY_INPUTS = [
      'reddito', 'investimento', 'minimoRetributivoAnnuo',
      'premiStraordinari', 'altriRedditi', 'ulterioriDetrazioni'
    ];

    initMoneyBounds() {
      FinancialController.CLAMPED_MONEY_INPUTS.forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.min = '0';
        input.max = '1000000';
        input.addEventListener('change', () => {
          const value = parseFloat(input.value);
          const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1000000);
          input.value = String(clamped);
        });
      });
    }

    // Controlli aumento: frequenza 0-100 anni; valore 0-100 se %, 0-1000000 se EUR.
    static VARIATION_BOUNDS = [
      ['variazioneRedditoFrequenza', 'variazioneRedditoValore', 'variazioneRedditoTipo'],
      ['variazioneInvestimentoFrequenza', 'variazioneInvestimentoValore', 'variazioneInvestimentoTipo'],
      ['variazioneBaseContributivaFrequenza', 'variazioneBaseContributivaValore', 'variazioneBaseContributivaTipo'],
      ['variazionePremiFrequenza', 'variazionePremiValore', 'variazionePremiTipo'],
      ['variazioneAltriRedditiFrequenza', 'variazioneAltriRedditiValore', 'variazioneAltriRedditiTipo'],
      ['guided-variazione-reddito-frequenza', 'guided-variazione-reddito-valore', 'guided-variazione-reddito-tipo'],
      ['guided-variazione-investimento-frequenza', 'guided-variazione-investimento-valore', 'guided-variazione-investimento-tipo'],
      ['guided-variazione-base-frequenza', 'guided-variazione-base-valore', 'guided-variazione-base-tipo'],
      ['guided-variazione-premi-frequenza', 'guided-variazione-premi-valore', 'guided-variazione-premi-tipo'],
      ['guided-variazione-altri-redditi-frequenza', 'guided-variazione-altri-redditi-valore', 'guided-variazione-altri-redditi-tipo']
    ];

    initVariationBounds() {
      const clamp = (input, min, max) => {
        const value = parseFloat(input.value);
        input.value = String(Math.min(Math.max(Number.isFinite(value) ? value : 0, min), max));
      };
      FinancialController.VARIATION_BOUNDS.forEach(([freqId, valId, tipoName]) => {
        const freq = document.getElementById(freqId);
        if (freq) {
          freq.min = '0';
          freq.max = '100';
          freq.addEventListener('change', () => clamp(freq, 0, 100));
        }
        const val = document.getElementById(valId);
        if (!val) return;
        const applyBounds = () => {
          const isEuro = document.querySelector(`input[name="${tipoName}"]:checked`)?.value === 'euro';
          val.min = '0';
          val.max = String(isEuro ? 1000000 : 100);
          // Freccine coerenti con l'unità: 100 EUR o 0,1 punti percentuali.
          val.step = isEuro ? '100' : '0.1';
        };
        applyBounds();
        val.addEventListener('change', () => {
          applyBounds();
          clamp(val, 0, parseFloat(val.max));
        });
        document.querySelectorAll(`input[name="${tipoName}"]`).forEach((radio) => {
          radio.addEventListener('change', () => {
            applyBounds();
            clamp(val, 0, parseFloat(val.max));
          });
        });
      });
    }

    /**
     * Clamp in tempo reale durante la digitazione: se il numero supera i
     * limiti min/max del campo, viene riportato subito al bordo (pannello e
     * guidata si comportano allo stesso modo).
     */
    initLiveClamps() {
      document.querySelectorAll('.control-shell input[type="number"], .guided-dialog input[type="number"]').forEach((input) => {
        const clampToBounds = () => {
          const value = parseFloat(input.value);
          if (!Number.isFinite(value)) return false;
          const min = parseFloat(input.min);
          const max = parseFloat(input.max);
          if (Number.isFinite(max) && value > max) input.value = String(max);
          else if (Number.isFinite(min) && value < min) input.value = String(min);
          return true;
        };
        input.addEventListener('input', clampToBounds);
        // Campo svuotato: al blur torna al minimo (o 0 se non definito).
        input.addEventListener('change', () => {
          if (!clampToBounds()) {
            const min = parseFloat(input.min);
            input.value = String(Number.isFinite(min) ? min : 0);
          }
        });
      });
    }

    static VARIATION_CONTROLS = [
      ['variazioneRedditoAndamento', 'variazioneRedditoFrequenza', 'variazioneRedditoValore'],
      ['variazioneInvestimentoAndamento', 'variazioneInvestimentoFrequenza', 'variazioneInvestimentoValore'],
      ['variazioneBaseContributivaAndamento', 'variazioneBaseContributivaFrequenza', 'variazioneBaseContributivaValore'],
      ['variazionePremiAndamento', 'variazionePremiFrequenza', 'variazionePremiValore'],
      ['variazioneAltriRedditiAndamento', 'variazioneAltriRedditiFrequenza', 'variazioneAltriRedditiValore']
    ];

    /**
     * Allinea lo switch Costante/Crescente ai valori correnti di frequenza/valore
     * (stato iniziale e rientro dalla modalità guidata).
     */
    initVariationStates() {
      FinancialController.VARIATION_CONTROLS.forEach(([selectId, freqId, valId]) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        const freq = parseFloat(document.getElementById(freqId)?.value) || 0;
        const val = parseFloat(document.getElementById(valId)?.value) || 0;
        select.value = freq > 0 && val !== 0 ? 'crescente' : 'costante';
      });
      this.syncVariationFields();
    }

    /**
     * Mostra i campi aumento solo con andamento Crescente e tiene
     * l'unità del valore coerente con il tipo scelto (% / EUR).
     */
    syncVariationFields() {
      document.querySelectorAll('select[data-variation-fields]').forEach((select) => {
        const fields = document.getElementById(select.dataset.variationFields);
        if (fields) fields.hidden = select.value !== 'crescente';
      });
      document.querySelectorAll('[data-unit-for]').forEach((unit) => {
        const tipo = document.querySelector(`input[name="${unit.dataset.unitFor}"]:checked`);
        unit.textContent = tipo?.value === 'euro' ? 'EUR' : '%';
      });
    }

    syncSegmentedControls() {
      document.querySelectorAll('.native-select[id]').forEach((select) => {
        this.syncSegmentedControl(select.id);
      });
    }

    syncSegmentedControl(selectId) {
      const select = document.getElementById(selectId);
      if (!select) return;

      document.querySelectorAll(`[data-select-target="${selectId}"]`).forEach((button) => {
        const isActive = button.dataset.selectValue === select.value;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    }

    getStrategyRows() {
      const strategies = this.latestResults?.strategies;
      return (strategies && strategies[this.strategyView]) || this.latestResults?.results || [];
    }

    getStrategyExitLabel() {
      return { mix: 'Exit ottimale', fp: 'Exit FP', pac: 'Exit PAC' }[this.strategyView] || 'Exit';
    }

    setStrategyView(strategy) {
      if (!['mix', 'fp', 'pac'].includes(strategy) || strategy === this.strategyView) return;
      this.strategyView = strategy;
      this.syncStrategyCards();
      if (!this.latestResults) return;
      this.view.createTable(this.getStrategyRows(), this.tableView, this.getStrategyExitLabel());
      this.view.highlightTableYear(this.annualExplorerYear);
      if (this.latestResults.config) {
        this.view.updateAnnualExplorer(this.getStrategyRows(), this.latestResults.config, this.annualExplorerYear);
        this.updateFpSplitCards(this.latestResults.results, this.latestResults.config);
      }
    }

    syncStrategyCards() {
      document.querySelectorAll('[data-strategy]').forEach((card) => {
        card.classList.toggle('strategy-active', card.dataset.strategy === this.strategyView);
      });
      document.querySelectorAll('[data-strategy-select]').forEach((button) => {
        const active = button.dataset.strategySelect === this.strategyView;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }

    scheduleResultsUpdate(delay = 200) {
      window.clearTimeout(this.updateResultsTimer);
      this.updateResultsTimer = window.setTimeout(() => {
        this.updateResults();
      }, delay);
    }

    openGuidedMode() {
      this.syncGuidedFieldsFromForm();
      this.syncSegmentedControls();
      this.syncVariationFields();
      this.setGuidedStep(0);
      this.updateGuidedContributionPreview();
      const modal = document.getElementById('guided-modal');
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      document.getElementById('guided-durata').focus({ preventScroll: true });
    }

    closeGuidedMode() {
      const modal = document.getElementById('guided-modal');
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      document.getElementById('open-guided-mode').focus({ preventScroll: true });
    }

    setGuidedStep(step) {
      const steps = [...document.querySelectorAll('.guided-step')];
      this.guidedStep = Math.min(Math.max(step, 0), steps.length - 1);

      steps.forEach((item, index) => {
        item.classList.toggle('active', index === this.guidedStep);
      });

      document.getElementById('guided-step-counter').textContent = `Step ${this.guidedStep + 1} di ${steps.length}`;
      document.getElementById('guided-progress-bar').style.width = `${((this.guidedStep + 1) / steps.length) * 100}%`;
      document.getElementById('guided-prev').disabled = this.guidedStep === 0;
      document.getElementById('guided-next').style.display = this.guidedStep === steps.length - 1 ? 'none' : 'inline-flex';
      document.getElementById('guided-finish').style.display = this.guidedStep === steps.length - 1 ? 'inline-flex' : 'none';
    }

    syncGuidedFieldsFromForm() {
      if (this._mirroring) return;
      this._mirroring = true;
      try {
        this._syncGuidedFieldsFromFormInner();
      } finally {
        this._mirroring = false;
      }
    }

    _syncGuidedFieldsFromFormInner() {
      const copyValue = (from, to) => {
        document.getElementById(to).value = document.getElementById(from).value;
      };
      const copyRadio = (fromName, toName) => {
        const selected = document.querySelector(`input[name="${fromName}"]:checked`);
        if (!selected) return;
        const target = document.querySelector(`input[name="${toName}"][value="${selected.value}"]`);
        if (target) target.checked = true;
      };
      const copyChecked = (from, to) => {
        document.getElementById(to).checked = document.getElementById(from).checked;
      };

      copyValue('reddito', 'guided-reddito');
      copyValue('premiStraordinari', 'guided-premi');
      copyValue('altriRedditi', 'guided-altri-redditi');
      copyValue('investimento', 'guided-investimento');
      copyValue('minimoRetributivoAnnuo', 'guided-minimo-retributivo');
      copyValue('durata', 'guided-durata');
      copyValue('variazioneRedditoFrequenza', 'guided-variazione-reddito-frequenza');
      copyValue('variazioneRedditoValore', 'guided-variazione-reddito-valore');
      copyValue('variazioneInvestimentoFrequenza', 'guided-variazione-investimento-frequenza');
      copyValue('variazioneInvestimentoValore', 'guided-variazione-investimento-valore');
      copyValue('variazioneBaseContributivaFrequenza', 'guided-variazione-base-frequenza');
      copyValue('variazioneBaseContributivaValore', 'guided-variazione-base-valore');
      copyValue('variazionePremiFrequenza', 'guided-variazione-premi-frequenza');
      copyValue('variazionePremiValore', 'guided-variazione-premi-valore');
      copyValue('variazioneAltriRedditiFrequenza', 'guided-variazione-altri-redditi-frequenza');
      copyValue('variazioneAltriRedditiValore', 'guided-variazione-altri-redditi-valore');
      copyRadio('variazioneRedditoTipo', 'guided-variazione-reddito-tipo');
      copyRadio('variazioneInvestimentoTipo', 'guided-variazione-investimento-tipo');
      copyRadio('variazioneBaseContributivaTipo', 'guided-variazione-base-tipo');
      copyRadio('variazionePremiTipo', 'guided-variazione-premi-tipo');
      copyRadio('variazioneAltriRedditiTipo', 'guided-variazione-altri-redditi-tipo');
      copyValue('variazioneRedditoAndamento', 'guided-variazione-reddito-andamento');
      copyValue('variazioneInvestimentoAndamento', 'guided-variazione-investimento-andamento');
      copyValue('variazioneBaseContributivaAndamento', 'guided-variazione-base-andamento');
      copyValue('variazionePremiAndamento', 'guided-variazione-premi-andamento');
      copyValue('variazioneAltriRedditiAndamento', 'guided-variazione-altri-redditi-andamento');
      document.getElementById('guided-modalita-confronto').value = document.getElementById('modalitaConfronto').value;
      copyValue('quotaMinAderentePerc', 'guided-quota-min');
      copyValue('contribuzioneDatoreFpPerc', 'guided-datore-perc');
      copyValue('addizionaliPerc', 'guided-addizionali');
      copyValue('ulterioriDetrazioni', 'guided-ulteriori-detrazioni');
      copyValue('anzianitaPregressaFp', 'guided-anzianita');
      copyChecked('riscattoAnticipato', 'guided-riscatto-anticipato');
      copyChecked('primaOccupazionePost2006', 'guided-prima-occupazione');
      copyValue('plafondExtraPrimaOccupazione', 'guided-plafond-extra');
      copyValue('contributiInpsPerc', 'guided-contributi-inps');
      copyValue('rendimentoAnnualeFpPerc', 'guided-rendimento-fp');
      copyValue('rendimentoAnnualePacPerc', 'guided-rendimento-pac');
      copyValue('costiAnnuiFpPerc', 'guided-costi-fp');
      copyValue('quotaAgevolataFpPerc', 'guided-quota-agevolata-fp');
      copyValue('costiAnnuiPacPerc', 'guided-costi-pac');
      copyValue('quotaAgevolataPacPerc', 'guided-quota-agevolata-pac');
      document.getElementById('guided-base-tipo').value = document.getElementById('baseContributivaFpTipo').value;
      document.getElementById('guided-base-datore-tipo').value = document.getElementById('baseDatoreFpTipo').value;
      document.getElementById('guided-rendimento-fp-mode').value = document.getElementById('rendimentoFpMode').value;
      document.getElementById('guided-rendimento-pac-mode').value = document.getElementById('rendimentoPacMode').value;
      document.getElementById('guided-modalita-versamento').value = document.getElementById('modalitaVersamentoFp').value;
      document.getElementById('guided-regione-addizionali').value = document.getElementById('regioneAddizionali').value;
      document.getElementById('guided-comune-addizionali').value = document.getElementById('comuneAddizionali').value;
      document.getElementById('guided-comune-addizionali-search').value = document.getElementById('comuneAddizionaliSearch').value;
      this.selectedGuidedMunicipalityLabel = document.getElementById('comuneAddizionaliSearch').value;
      this.setGuidedTaxMode(this.localTaxMode);
      this.updateGuidedFirstEmploymentFields();
      this.updateGuidedContributionBaseFields();
      this.updateGuidedReturnFields();
    }

    /**
     * Applica al pannello i valori correnti della guidata e ricalcola.
     * Chiamata sia da "Avanti" (commit progressivo: chiudendo la guidata a
     * metà, gli step già confermati restano nel pannello) sia da "Applica".
     */
    commitGuidedFieldsToForm() {
      if (this._mirroring) return;
      this._mirroring = true;
      try {
        this._commitGuidedFieldsToFormInner();
      } finally {
        this._mirroring = false;
      }
    }

    _commitGuidedFieldsToFormInner() {
      const copyValue = (from, to) => {
        document.getElementById(to).value = document.getElementById(from).value;
      };
      const copyRadio = (fromName, toName) => {
        const selected = document.querySelector(`input[name="${fromName}"]:checked`);
        if (!selected) return;
        const target = document.querySelector(`input[name="${toName}"][value="${selected.value}"]`);
        if (target) target.checked = true;
      };
      const copyChecked = (from, to) => {
        document.getElementById(to).checked = document.getElementById(from).checked;
      };

      copyValue('guided-reddito', 'reddito');
      copyValue('guided-premi', 'premiStraordinari');
      copyValue('guided-altri-redditi', 'altriRedditi');
      copyValue('guided-investimento', 'investimento');
      copyValue('guided-minimo-retributivo', 'minimoRetributivoAnnuo');
      copyValue('guided-durata', 'durata');
      copyValue('guided-variazione-reddito-frequenza', 'variazioneRedditoFrequenza');
      copyValue('guided-variazione-reddito-valore', 'variazioneRedditoValore');
      copyValue('guided-variazione-investimento-frequenza', 'variazioneInvestimentoFrequenza');
      copyValue('guided-variazione-investimento-valore', 'variazioneInvestimentoValore');
      copyValue('guided-variazione-base-frequenza', 'variazioneBaseContributivaFrequenza');
      copyValue('guided-variazione-base-valore', 'variazioneBaseContributivaValore');
      copyValue('guided-variazione-premi-frequenza', 'variazionePremiFrequenza');
      copyValue('guided-variazione-premi-valore', 'variazionePremiValore');
      copyValue('guided-variazione-altri-redditi-frequenza', 'variazioneAltriRedditiFrequenza');
      copyValue('guided-variazione-altri-redditi-valore', 'variazioneAltriRedditiValore');
      copyRadio('guided-variazione-reddito-tipo', 'variazioneRedditoTipo');
      copyRadio('guided-variazione-investimento-tipo', 'variazioneInvestimentoTipo');
      copyRadio('guided-variazione-base-tipo', 'variazioneBaseContributivaTipo');
      copyRadio('guided-variazione-premi-tipo', 'variazionePremiTipo');
      copyRadio('guided-variazione-altri-redditi-tipo', 'variazioneAltriRedditiTipo');
      copyValue('guided-variazione-reddito-andamento', 'variazioneRedditoAndamento');
      copyValue('guided-variazione-investimento-andamento', 'variazioneInvestimentoAndamento');
      copyValue('guided-variazione-base-andamento', 'variazioneBaseContributivaAndamento');
      copyValue('guided-variazione-premi-andamento', 'variazionePremiAndamento');
      copyValue('guided-variazione-altri-redditi-andamento', 'variazioneAltriRedditiAndamento');
      document.getElementById('modalitaConfronto').value = document.getElementById('guided-modalita-confronto').value;
      copyValue('guided-quota-min', 'quotaMinAderentePerc');
      copyValue('guided-datore-perc', 'contribuzioneDatoreFpPerc');
      copyValue('guided-addizionali', 'addizionaliPerc');
      copyValue('guided-ulteriori-detrazioni', 'ulterioriDetrazioni');
      copyValue('guided-anzianita', 'anzianitaPregressaFp');
      copyChecked('guided-riscatto-anticipato', 'riscattoAnticipato');
      copyChecked('guided-prima-occupazione', 'primaOccupazionePost2006');
      copyValue('guided-plafond-extra', 'plafondExtraPrimaOccupazione');
      copyValue('guided-contributi-inps', 'contributiInpsPerc');
      copyValue('guided-rendimento-fp', 'rendimentoAnnualeFpPerc');
      copyValue('guided-rendimento-pac', 'rendimentoAnnualePacPerc');
      copyValue('guided-costi-fp', 'costiAnnuiFpPerc');
      copyValue('guided-quota-agevolata-fp', 'quotaAgevolataFpPerc');
      copyValue('guided-costi-pac', 'costiAnnuiPacPerc');
      copyValue('guided-quota-agevolata-pac', 'quotaAgevolataPacPerc');

      document.getElementById('baseContributivaFpTipo').value = document.getElementById('guided-base-tipo').value;
      document.getElementById('baseDatoreFpTipo').value = document.getElementById('guided-base-datore-tipo').value;
      document.getElementById('rendimentoFpMode').value = document.getElementById('guided-rendimento-fp-mode').value;
      document.getElementById('rendimentoPacMode').value = document.getElementById('guided-rendimento-pac-mode').value;
      document.getElementById('modalitaVersamentoFp').value = document.getElementById('guided-modalita-versamento').value;
      document.getElementById('regioneAddizionali').value = document.getElementById('guided-regione-addizionali').value;
      document.getElementById('comuneAddizionali').value = document.getElementById('guided-comune-addizionali').value;
      document.getElementById('comuneAddizionaliSearch').value = document.getElementById('guided-comune-addizionali-search').value;
      this.selectedMunicipalityLabel = this.selectedGuidedMunicipalityLabel;
      this.setLocalTaxMode(this.guidedTaxMode);
      this.updateFirstEmploymentFields();
      this.updateContributionBaseFields();
      this.updateGuidedContributionBaseFields();
      this.updateLocalTaxFields();
      // Gli andamenti sono stati copiati dalla guidata: basta riallineare
      // visibilità dei campi aumento e stato dei segmented control.
      this.syncVariationFields();
      this.syncSegmentedControls();
      this.updateResults();
    }

    applyGuidedMode() {
      this.commitGuidedFieldsToForm();
      this.closeGuidedMode();
    }

    updateGuidedContributionPreview() {
      const readGuidedNumber = (id, fallback = 0) => {
        const value = parseFloat(document.getElementById(id).value);
        return Number.isFinite(value) ? value : fallback;
      };
      const clampGuidedNumber = (id, min, max = Infinity) => {
        const input = document.getElementById(id);
        const value = parseFloat(input.value);
        input.min = String(min);
        if (Number.isFinite(max)) input.max = String(max);
        if (!Number.isFinite(value)) return;
        if (value < min) input.value = String(min);
        if (value > max) input.value = String(max);
      };

      clampGuidedNumber('guided-reddito', 0, 1000000);
      clampGuidedNumber('guided-premi', 0, 1000000);
      clampGuidedNumber('guided-altri-redditi', 0, 1000000);
      clampGuidedNumber('guided-investimento', 0, 1000000);
      clampGuidedNumber('guided-minimo-retributivo', 0, 1000000);
      clampGuidedNumber('guided-durata', 1, 100);
      clampGuidedNumber('guided-variazione-reddito-frequenza', 0, 100);
      clampGuidedNumber('guided-variazione-investimento-frequenza', 0, 100);
      clampGuidedNumber('guided-variazione-base-frequenza', 0, 100);
      clampGuidedNumber('guided-variazione-premi-frequenza', 0, 100);
      clampGuidedNumber('guided-variazione-altri-redditi-frequenza', 0, 100);
      clampGuidedNumber('guided-quota-min', 0, 100);
      clampGuidedNumber('guided-datore-perc', 0, 100);
      clampGuidedNumber('guided-addizionali', 0, 10);
      clampGuidedNumber('guided-ulteriori-detrazioni', 0);
      clampGuidedNumber('guided-contributi-inps', 0, 20);
      clampGuidedNumber('guided-anzianita', 0, 50);
      clampGuidedNumber('guided-plafond-extra', 0, FINANCIAL_CONSTANTS.PLAFOND_PRIMA_OCCUPAZIONE_MAX);
      this.updateGuidedFirstEmploymentFields();
      clampGuidedNumber('guided-rendimento-fp', 0, 100);
      clampGuidedNumber('guided-rendimento-pac', 0, 100);
      clampGuidedNumber('guided-costi-fp', 0, 5);
      clampGuidedNumber('guided-costi-pac', 0, 5);
      clampGuidedNumber('guided-quota-agevolata-fp', 0, 100);
      clampGuidedNumber('guided-quota-agevolata-pac', 0, 100);

      // Le card (quote, extra, busta/bonifico) sono aggiornate da updateFpSplitCards
      // sugli stessi dati del pannello: nessun calcolo duplicato qui.
    }

    /**
     * Funzione principale di calcolo che raccoglie gli input e aggiorna i risultati
     */
    updateResults() {
      window.clearTimeout(this.updateResultsTimer);
      this.updateEffectiveTaxOutputs();
      this.updateFirstEmploymentFields();
      this.updateContributionBaseFields();
      const readNumber = (id, fallback = 0) => {
        const value = parseFloat(document.getElementById(id).value);
        return Number.isFinite(value) ? value : fallback;
      };
      const readRadio = (name, fallback) => {
        const selected = document.querySelector(`input[name="${name}"]:checked`);
        return selected ? selected.value : fallback;
      };
      // Con andamento Costante gli aumenti non devono entrare nel modello.
      const readVariationNumber = (selectId, inputId) => {
        const crescente = document.getElementById(selectId)?.value === 'crescente';
        return crescente ? readNumber(inputId) : 0;
      };

      // Raccogli tutti i valori di input
      const primaOccupazionePost2006 = document.getElementById('primaOccupazionePost2006').checked;
      const anzianitaPregressaFp = readNumber('anzianitaPregressaFp');

      const config = {
        durata: readNumber('durata', 1),
        reddito: readNumber('reddito'),
        premiStraordinari: readNumber('premiStraordinari'),
        altriRedditi: readNumber('altriRedditi'),
        variazionePremiTipo: readRadio('variazionePremiTipo', 'percentuale'),
        variazionePremiFrequenza: readVariationNumber('variazionePremiAndamento', 'variazionePremiFrequenza'),
        variazionePremiValore: readVariationNumber('variazionePremiAndamento', 'variazionePremiValore'),
        variazioneAltriRedditiTipo: readRadio('variazioneAltriRedditiTipo', 'percentuale'),
        variazioneAltriRedditiFrequenza: readVariationNumber('variazioneAltriRedditiAndamento', 'variazioneAltriRedditiFrequenza'),
        variazioneAltriRedditiValore: readVariationNumber('variazioneAltriRedditiAndamento', 'variazioneAltriRedditiValore'),
        investimento: readNumber('investimento'),
        modalitaConfronto: document.getElementById('modalitaConfronto').value,
        variazioneRedditoTipo: readRadio('variazioneRedditoTipo', 'percentuale'),
        variazioneRedditoFrequenza: readVariationNumber('variazioneRedditoAndamento', 'variazioneRedditoFrequenza'),
        variazioneRedditoValore: readVariationNumber('variazioneRedditoAndamento', 'variazioneRedditoValore'),
        variazioneInvestimentoTipo: readRadio('variazioneInvestimentoTipo', 'percentuale'),
        variazioneInvestimentoFrequenza: readVariationNumber('variazioneInvestimentoAndamento', 'variazioneInvestimentoFrequenza'),
        variazioneInvestimentoValore: readVariationNumber('variazioneInvestimentoAndamento', 'variazioneInvestimentoValore'),

        // Percentuali contributi
        quotaDatoreFpPerc: readNumber('contribuzioneDatoreFpPerc') / 100,
        contributoDatoreFisso: readNumber('contributoDatoreFisso'),
        quotaMinAderentePerc: readNumber('quotaMinAderentePerc') / 100,
        baseContributivaFpTipo: document.getElementById('baseContributivaFpTipo').value,
        baseContributivaFp: readNumber('baseContributivaFp'),
        baseDatoreFpTipo: document.getElementById('baseDatoreFpTipo').value,
        baseDatoreFp: readNumber('baseDatoreFp'),
        variazioneBaseContributivaTipo: readRadio('variazioneBaseContributivaTipo', 'percentuale'),
        variazioneBaseContributivaFrequenza: readVariationNumber('variazioneBaseContributivaAndamento', 'variazioneBaseContributivaFrequenza'),
        variazioneBaseContributivaValore: readVariationNumber('variazioneBaseContributivaAndamento', 'variazioneBaseContributivaValore'),
        contributiInpsPerc: readNumber('contributiInpsPerc', 9.19) / 100,
        massimaleContributivoInps: readNumber('massimaleContributivoInps', 120607),
        sogliaIvsAggiuntivo: readNumber('sogliaIvsAggiuntivo', 55448),
        aliquotaIvsAggiuntivaPerc: readNumber('aliquotaIvsAggiuntivaPerc', 1) / 100,
        addizionaliPerc: readNumber('addizionaliPerc') / 100,
        ulterioriDetrazioni: readNumber('ulterioriDetrazioni'),
        modalitaVersamentoFp: document.getElementById('modalitaVersamentoFp').value,

        // Tassi di rendimento
        rendimentoAnnualeFpPerc: readNumber('rendimentoAnnualeFpPerc') / 100,
        rendimentoAnnualePacPerc: readNumber('rendimentoAnnualePacPerc') / 100,
        rendimentoFpMode: document.getElementById('rendimentoFpMode').value,
        costiAnnuiFpPerc: readNumber('costiAnnuiFpPerc') / 100,
        quotaAgevolataFpPerc: readNumber('quotaAgevolataFpPerc') / 100,
        rendimentoPacMode: document.getElementById('rendimentoPacMode').value,
        costiAnnuiPacPerc: readNumber('costiAnnuiPacPerc') / 100,
        quotaAgevolataPacPerc: readNumber('quotaAgevolataPacPerc') / 100,
        rendimentoNettoFpEffettivo: this.calculateComparableNetReturn('fp') / 100,
        rendimentoNettoPacEffettivo: this.calculateComparableNetReturn('pac') / 100,

        // Assunzioni fisse del modello
        reinvestiRisparmio: true,
        modalitaCumulativa: true,
        riscattoAnticipato: document.getElementById('riscattoAnticipato').checked,
        anzianitaPregressaFp,

        // Maggiorazione deduzione per prima occupazione post 2006
        primaOccupazionePost2006,
        plafondExtraPrimaOccupazione: readNumber('plafondExtraPrimaOccupazione'),
        anniResiduiMaggiorazione: this.calculateFirstEmploymentRemainingYears(anzianitaPregressaFp, primaOccupazionePost2006),
        anniAttesaMaggiorazione: this.calculateFirstEmploymentWaitYears(anzianitaPregressaFp, primaOccupazionePost2006)
      };
  
      // Calcola i risultati usando il model
      const results = this.model.calculateResults(config);
      this.latestResults = { ...results, config };
      
      // Aggiorna la view
      this.view.createTable(this.getStrategyRows(), this.tableView, this.getStrategyExitLabel());
      this.view.highlightTableYear(this.annualExplorerYear);
      this.view.updateMetricsDashboard(results.results);
      this.view.updateChoiceSequence(results.results);
      this.view.updateResultExplanation(results.results);
      this.view.updateAnnualExplorer(this.getStrategyRows(), config, this.annualExplorerYear);
      this.view.updateInputWarnings(buildInputWarnings(config));
      this.view.updateChart(results.results);

      // Aggiorna la visualizzazione dell'investimento minimo
      this.updateMinInvestimentoDisplay(
        config.reddito,
        config.quotaMinAderentePerc,
        config.baseContributivaFpTipo,
        config.baseContributivaFp
      );
      this.updateInvestmentModeSummary(config, results.results);
      this.updateFpSplitCards(results.results, config);

      // Aggiorna il contenuto CSV per il download
      this.csvContent = this.model.convertToCSV(results.results);
    }

    updateEffectiveTaxOutputs() {
      const clampInput = (id, min, max) => {
        const input = document.getElementById(id);
        if (!input) return 0;
        const value = parseFloat(input.value);
        if (!Number.isFinite(value)) return 0;
        const clamped = Math.min(Math.max(value, min), max);
        if (clamped !== value) input.value = String(clamped);
        return clamped;
      };
      const formatPercent = (value) => `${(value * 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}%`;

      const fpMode = document.getElementById('rendimentoFpMode').value;
      const pacMode = document.getElementById('rendimentoPacMode').value;
      const fpIsGross = fpMode === 'lordo';
      const pacIsGross = pacMode === 'lordo';
      document.querySelector('[data-return-extra="fp"]').hidden = !fpIsGross;
      document.querySelector('[data-return-extra="pac"]').hidden = !pacIsGross;
      document.querySelector('[data-return-net-note="pac"]').hidden = pacIsGross;

      const quotaFpAgevolata = fpIsGross ? clampInput('quotaAgevolataFpPerc', 0, 100) / 100 : 0;
      const quotaPacAgevolata = pacIsGross ? clampInput('quotaAgevolataPacPerc', 0, 100) / 100 : 0;
      const costiFp = fpIsGross ? clampInput('costiAnnuiFpPerc', 0, 5) : 0;
      const costiPac = pacIsGross ? clampInput('costiAnnuiPacPerc', 0, 5) : 0;

      const tassaFp = (quotaFpAgevolata * 0.125) + ((1 - quotaFpAgevolata) * 0.20);
      const tassaPac = (quotaPacAgevolata * 0.125) + ((1 - quotaPacAgevolata) * 0.26);
      document.getElementById('tassaEffettivaFp').textContent = formatPercent(tassaFp);
      document.getElementById('tassaEffettivaPac').textContent = formatPercent(tassaPac);
      document.getElementById('rendimentoNettoFp').textContent = formatPercent(
        this.calculateNetReturnFromValues(
          parseFloat(document.getElementById('rendimentoAnnualeFpPerc').value) || 0,
          costiFp,
          tassaFp
        ) / 100
      );
      document.getElementById('rendimentoNettoPac').textContent = formatPercent(
        this.calculateNetReturnFromValues(
          parseFloat(document.getElementById('rendimentoAnnualePacPerc').value) || 0,
          costiPac,
          tassaPac
        ) / 100
      );
    }

    calculateComparableNetReturn(kind) {
      const mode = document.getElementById(kind === 'fp' ? 'rendimentoFpMode' : 'rendimentoPacMode').value;
      const grossReturn = parseFloat(document.getElementById(kind === 'fp' ? 'rendimentoAnnualeFpPerc' : 'rendimentoAnnualePacPerc').value) || 0;
      if (mode !== 'lordo') return grossReturn;

      const costs = parseFloat(document.getElementById(kind === 'fp' ? 'costiAnnuiFpPerc' : 'costiAnnuiPacPerc').value) || 0;
      const quotaAgevolata = (parseFloat(document.getElementById(kind === 'fp' ? 'quotaAgevolataFpPerc' : 'quotaAgevolataPacPerc').value) || 0) / 100;
      const ordinaryTax = kind === 'fp' ? 0.20 : 0.26;
      const taxRate = (Math.min(Math.max(quotaAgevolata, 0), 1) * 0.125) + ((1 - Math.min(Math.max(quotaAgevolata, 0), 1)) * ordinaryTax);
      return this.calculateNetReturnFromValues(grossReturn, costs, taxRate);
    }

    calculateNetReturnFromValues(grossReturnPerc, annualCostsPerc, taxRate) {
      const grossReturn = Math.max(grossReturnPerc, 0) / 100;
      const annualCosts = Math.min(Math.max(annualCostsPerc, 0), 100) / 100;
      const safeTaxRate = Math.min(Math.max(taxRate, 0), 1);
      return ((((1 + (grossReturn * (1 - safeTaxRate))) * (1 - annualCosts)) - 1) * 100);
    }

    updateFirstEmploymentFields() {
      const enabled = document.getElementById('primaOccupazionePost2006').checked;
      const yearsDisplay = document.getElementById('anniResiduiMaggiorazione');
      const anzianita = parseFloat(document.getElementById('anzianitaPregressaFp').value) || 0;
      document.getElementById('plafondExtraPrimaOccupazione').disabled = !enabled;
      // Campo plafond e card anni residui compaiono solo con toggle su Sì.
      document.getElementById('plafond-extra-field')?.toggleAttribute('hidden', !enabled);
      document.getElementById('prima-occupazione-fields')?.toggleAttribute('hidden', !enabled);
      yearsDisplay.textContent = `${this.calculateFirstEmploymentRemainingYears(anzianita, enabled)} anni`;
      const hint = document.getElementById('anniResiduiMaggiorazioneHint');
      if (hint) {
        const waitYears = this.calculateFirstEmploymentWaitYears(anzianita, enabled);
        hint.textContent = waitYears > 0
          ? `Recupero dal 6° anno di partecipazione: parte tra ${waitYears} ann${waitYears === 1 ? 'o' : 'i'}.`
          : 'Calcolati da anzianità FP già maturata.';
      }
    }

    updateGuidedFirstEmploymentFields() {
      const enabled = document.getElementById('guided-prima-occupazione').checked;
      const yearsDisplay = document.getElementById('guided-anni-maggiorazione');
      const anzianita = parseFloat(document.getElementById('guided-anzianita').value) || 0;
      document.getElementById('guided-plafond-extra').disabled = !enabled;
      // Come nel pannello: campo plafond e card anni residui solo con toggle su Sì.
      document.getElementById('guided-plafond-extra-field')?.toggleAttribute('hidden', !enabled);
      document.getElementById('guided-prima-occupazione-fields')?.toggleAttribute('hidden', !enabled);
      yearsDisplay.textContent = `${this.calculateFirstEmploymentRemainingYears(anzianita, enabled)} anni`;
      const hint = document.getElementById('guided-anni-maggiorazione-hint');
      if (hint) {
        const waitYears = this.calculateFirstEmploymentWaitYears(anzianita, enabled);
        hint.textContent = waitYears > 0
          ? `Recupero dal 6° anno di partecipazione: parte tra ${waitYears} ann${waitYears === 1 ? 'o' : 'i'}.`
          : 'Calcolati da anzianità FP già maturata.';
      }
    }

    calculateFirstEmploymentRemainingYears(anzianitaPregressaFp, enabled = true) {
      if (!enabled) return 0;

      // Il recupero copre gli anni di partecipazione dal 6° al 25°: chi è
      // ancora nel quinquennio iniziale ha davanti l'intera finestra di 20 anni.
      const completedYears = Math.max(Math.floor(anzianitaPregressaFp || 0), 0);
      return Math.min(
        Math.max(25 - Math.max(completedYears, 5), 0),
        FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNI
      );
    }

    calculateFirstEmploymentWaitYears(anzianitaPregressaFp, enabled = true) {
      if (!enabled) return 0;
      const completedYears = Math.max(Math.floor(anzianitaPregressaFp || 0), 0);
      return Math.max(5 - completedYears, 0);
    }

    updateContributionBaseFields() {
      const minimoInput = document.getElementById('minimoRetributivoAnnuo');
      const rawMinimo = parseFloat(minimoInput.value) || 0;
      const minimo = Math.max(rawMinimo, 0);
      const baseInput = document.getElementById('baseContributivaFp');
      const baseDatoreInput = document.getElementById('baseDatoreFp');
      const baseTipo = document.getElementById('baseContributivaFpTipo').value;
      const baseDatoreTipo = document.getElementById('baseDatoreFpTipo').value;
      const minimumFields = document.getElementById('minimum-wage-fields');
      const usesMinimumWage = baseTipo === 'minimoRetributivo' || baseDatoreTipo === 'minimoRetributivo';

      if (rawMinimo !== minimo) {
        minimoInput.value = String(minimo);
      }

      baseInput.value = String(minimo);
      baseDatoreInput.value = String(minimo);
      if (minimumFields) {
        minimumFields.hidden = !usesMinimumWage;
      }
    }

    updateGuidedContributionBaseFields() {
      const baseTipo = document.getElementById('guided-base-tipo')?.value;
      const baseDatoreTipo = document.getElementById('guided-base-datore-tipo')?.value;
      const minimumFields = document.getElementById('guided-minimum-wage-fields');
      if (!minimumFields) return;

      minimumFields.hidden = baseTipo !== 'minimoRetributivo' && baseDatoreTipo !== 'minimoRetributivo';
    }

    updateContributionBaseLabels() {
      this.updateContributionBaseFields();
    }

    updateGuidedReturnFields() {
      const fpMode = document.getElementById('guided-rendimento-fp-mode').value;
      const pacMode = document.getElementById('guided-rendimento-pac-mode').value;

      document.querySelectorAll('[data-guided-return-extra="fp"]').forEach((element) => {
        element.hidden = fpMode !== 'lordo';
      });
      document.querySelectorAll('[data-guided-return-extra="pac"]').forEach((element) => {
        element.hidden = pacMode !== 'lordo';
      });

      // Stesse card informative del pannello: tassa effettiva e netto calcolato.
      const readNumber = (id) => {
        const value = parseFloat(document.getElementById(id)?.value);
        return Number.isFinite(value) ? value : 0;
      };
      const formatPercent = (value) => `${value.toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}%`;
      const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      };

      const quotaFpAgevolata = fpMode === 'lordo' ? Math.min(Math.max(readNumber('guided-quota-agevolata-fp'), 0), 100) / 100 : 0;
      const quotaPacAgevolata = pacMode === 'lordo' ? Math.min(Math.max(readNumber('guided-quota-agevolata-pac'), 0), 100) / 100 : 0;
      const costiFp = fpMode === 'lordo' ? Math.min(Math.max(readNumber('guided-costi-fp'), 0), 5) : 0;
      const costiPac = pacMode === 'lordo' ? Math.min(Math.max(readNumber('guided-costi-pac'), 0), 5) : 0;
      const tassaFp = (quotaFpAgevolata * 0.125) + ((1 - quotaFpAgevolata) * 0.20);
      const tassaPac = (quotaPacAgevolata * 0.125) + ((1 - quotaPacAgevolata) * 0.26);

      setText('guided-tassa-effettiva-fp', formatPercent(tassaFp * 100));
      setText('guided-tassa-effettiva-pac', formatPercent(tassaPac * 100));
      setText('guided-rendimento-netto-fp', formatPercent(
        this.calculateNetReturnFromValues(readNumber('guided-rendimento-fp'), costiFp, tassaFp)
      ));
      setText('guided-rendimento-netto-pac', formatPercent(
        this.calculateNetReturnFromValues(readNumber('guided-rendimento-pac'), costiPac, tassaPac)
      ));
    }

    populateLocalTaxSelectors() {
      const regionSelect = document.getElementById('regioneAddizionali');
      if (!regionSelect) return;

      regionSelect.replaceChildren(
        new Option('Seleziona regione', ''),
        ...[...REGIONAL_TAX_2026]
          .sort((a, b) => a.name.localeCompare(b.name, 'it'))
          .map((region) => new Option(region.name, region.id))
      );
    }

    populateGuidedLocalTaxSelectors() {
      const regionSelect = document.getElementById('guided-regione-addizionali');
      if (!regionSelect) return;

      regionSelect.replaceChildren(
        new Option('Seleziona regione', ''),
        ...[...REGIONAL_TAX_2026]
          .sort((a, b) => a.name.localeCompare(b.name, 'it'))
          .map((region) => new Option(region.name, region.id))
      );
    }

    setLocalTaxMode(mode, { clearLocation = false } = {}) {
      this.localTaxMode = mode === 'auto' ? 'auto' : 'manual';
      const panel = document.getElementById('local-tax-panel');
      const addizionaliInput = document.getElementById('addizionaliPerc');
      if (panel) {
        panel.dataset.localTaxModeCurrent = this.localTaxMode;
      }
      document.querySelectorAll('[data-local-tax-mode]').forEach((button) => {
        const active = button.dataset.localTaxMode === this.localTaxMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      document.querySelectorAll('.local-tax-auto-fields').forEach((element) => {
        element.setAttribute('aria-hidden', String(this.localTaxMode !== 'auto'));
      });
      document.querySelectorAll('.local-tax-manual-fields').forEach((element) => {
        element.setAttribute('aria-hidden', String(this.localTaxMode === 'auto'));
      });
      if (clearLocation) {
        document.getElementById('regioneAddizionali').value = '';
        this.clearMunicipalitySelection();
        this.hideMunicipalitySuggestions();
      }
      if (addizionaliInput) {
        addizionaliInput.disabled = this.localTaxMode === 'auto';
      }
      this.updateLocalTaxFields();
    }

    renderMunicipalitySuggestions(query) {
      const results = document.getElementById('comuneAddizionaliResults');
      const input = document.getElementById('comuneAddizionaliSearch');
      if (!results || !input) return;

      const municipalities = searchMunicipalities(query, 20);
      results.replaceChildren();

      if (!query.trim()) {
        this.hideMunicipalitySuggestions();
        return;
      }

      if (!municipalities.length) {
        const empty = document.createElement('div');
        empty.className = 'autocomplete-empty';
        empty.textContent = 'Nessun comune trovato';
        results.appendChild(empty);
      } else {
        municipalities.forEach((municipality) => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'autocomplete-option';
          option.setAttribute('role', 'option');
          option.textContent = `${municipality.name} (${municipality.province})`;
          option.addEventListener('click', () => {
            this.selectMunicipality(municipality.code);
            this.updateResults();
          });
          results.appendChild(option);
        });
      }

      results.classList.add('is-visible');
      input.setAttribute('aria-expanded', 'true');
    }

    hideMunicipalitySuggestions() {
      document.getElementById('comuneAddizionaliResults')?.classList.remove('is-visible');
      document.getElementById('comuneAddizionaliSearch')?.setAttribute('aria-expanded', 'false');
    }

    selectMunicipality(municipalityCode) {
      const municipality = findMunicipalityByCode(municipalityCode);
      if (!municipality) return;

      this.setLocalTaxMode('auto');
      document.getElementById('comuneAddizionali').value = municipality.code;
      this.selectedMunicipalityLabel = `${municipality.name} (${municipality.province})`;
      document.getElementById('comuneAddizionaliSearch').value = this.selectedMunicipalityLabel;
      this.hideMunicipalitySuggestions();
      this.updateLocalTaxFields();
    }

    clearMunicipalitySelection() {
      const municipalityCode = document.getElementById('comuneAddizionali');
      const municipalitySearch = document.getElementById('comuneAddizionaliSearch');
      if (municipalityCode) municipalityCode.value = '';
      if (municipalitySearch) municipalitySearch.value = '';
      this.selectedMunicipalityLabel = '';
    }

    setGuidedTaxMode(mode, { clearLocation = false } = {}) {
      this.guidedTaxMode = mode === 'auto' ? 'auto' : 'manual';
      document.querySelectorAll('[data-guided-tax-mode]').forEach((button) => {
        const active = button.dataset.guidedTaxMode === this.guidedTaxMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      document.querySelectorAll('.guided-tax-auto-fields').forEach((element) => {
        element.setAttribute('aria-hidden', String(this.guidedTaxMode !== 'auto'));
      });
      document.querySelectorAll('.guided-tax-manual-fields').forEach((element) => {
        element.setAttribute('aria-hidden', String(this.guidedTaxMode === 'auto'));
      });
      if (clearLocation) {
        document.getElementById('guided-regione-addizionali').value = '';
        this.clearGuidedMunicipalitySelection();
        this.hideGuidedMunicipalitySuggestions();
      }
      document.getElementById('guided-addizionali').disabled = this.guidedTaxMode === 'auto';
      this.updateGuidedLocalTaxFields();
    }

    renderGuidedMunicipalitySuggestions(query) {
      const results = document.getElementById('guided-comune-addizionali-results');
      const input = document.getElementById('guided-comune-addizionali-search');
      if (!results || !input) return;

      const municipalities = searchMunicipalities(query, 20);
      results.replaceChildren();

      if (!query.trim()) {
        this.hideGuidedMunicipalitySuggestions();
        return;
      }

      if (!municipalities.length) {
        const empty = document.createElement('div');
        empty.className = 'autocomplete-empty';
        empty.textContent = 'Nessun comune trovato';
        results.appendChild(empty);
      } else {
        municipalities.forEach((municipality) => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'autocomplete-option';
          option.setAttribute('role', 'option');
          option.textContent = `${municipality.name} (${municipality.province})`;
          option.addEventListener('click', () => {
            this.selectGuidedMunicipality(municipality.code);
          });
          results.appendChild(option);
        });
      }

      results.classList.add('is-visible');
      input.setAttribute('aria-expanded', 'true');
    }

    hideGuidedMunicipalitySuggestions() {
      document.getElementById('guided-comune-addizionali-results')?.classList.remove('is-visible');
      document.getElementById('guided-comune-addizionali-search')?.setAttribute('aria-expanded', 'false');
    }

    selectGuidedMunicipality(municipalityCode) {
      const municipality = findMunicipalityByCode(municipalityCode);
      if (!municipality) return;

      this.setGuidedTaxMode('auto');
      document.getElementById('guided-comune-addizionali').value = municipality.code;
      this.selectedGuidedMunicipalityLabel = `${municipality.name} (${municipality.province})`;
      document.getElementById('guided-comune-addizionali-search').value = this.selectedGuidedMunicipalityLabel;
      this.hideGuidedMunicipalitySuggestions();
      this.updateGuidedLocalTaxFields();
    }

    clearGuidedMunicipalitySelection() {
      document.getElementById('guided-comune-addizionali').value = '';
      document.getElementById('guided-comune-addizionali-search').value = '';
      this.selectedGuidedMunicipalityLabel = '';
    }

    updateGuidedLocalTaxFields() {
      const readNumber = (id, fallback = 0) => {
        const value = parseFloat(document.getElementById(id).value);
        return Number.isFinite(value) ? value : fallback;
      };
      const regionSelect = document.getElementById('guided-regione-addizionali');
      const municipalityInput = document.getElementById('guided-comune-addizionali');
      const addizionaliInput = document.getElementById('guided-addizionali');
      const rateCards = document.getElementById('guided-local-tax-rate-cards');
      const hideRateCards = () => rateCards?.setAttribute('aria-hidden', 'true');
      if (!regionSelect || !municipalityInput || !addizionaliInput) return;

      if (this.guidedTaxMode !== 'auto') {
        addizionaliInput.disabled = false;
        hideRateCards();
        return;
      }

      const selected = calculateLocalTaxRate({
        reddito: readNumber('guided-reddito') + Math.max(readNumber('guided-premi'), 0),
        regionId: regionSelect.value,
        municipalityCode: municipalityInput.value
      });

      if (selected.region && regionSelect.value !== selected.region.id) {
        regionSelect.value = selected.region.id;
      }

      addizionaliInput.disabled = true;
      addizionaliInput.value = (selected.totalRate * 100).toFixed(2);

      // Come nel pannello: le card regione/comune compaiono solo con un comune selezionato.
      if (!selected.municipality || !rateCards) {
        hideRateCards();
        return;
      }

      const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      };
      rateCards.setAttribute('aria-hidden', 'false');
      setText('guided-local-tax-region-title', `Aliquota regionale — ${selected.region?.name || '-'}`);
      setText('guided-local-tax-region-rate', `${(selected.regionalRate * 100).toFixed(2)}%`);
      setText('guided-local-tax-municipal-title', `Aliquota comunale — ${selected.municipality.name}`);
      setText('guided-local-tax-municipal-rate', `${(selected.municipalRate * 100).toFixed(2)}%`);
    }

    updateLocalTaxFields() {
      const readNumber = (id, fallback = 0) => {
        const value = parseFloat(document.getElementById(id).value);
        return Number.isFinite(value) ? value : fallback;
      };
      const regionSelect = document.getElementById('regioneAddizionali');
      const municipalityInput = document.getElementById('comuneAddizionali');
      const addizionaliInput = document.getElementById('addizionaliPerc');
      const rateCards = document.getElementById('local-tax-rate-cards');
      const hideRateCards = () => rateCards?.setAttribute('aria-hidden', 'true');
      if (!regionSelect || !municipalityInput || !addizionaliInput) return;

      if (this.localTaxMode !== 'auto') {
        addizionaliInput.disabled = false;
        hideRateCards();
        return;
      }

      const selected = calculateLocalTaxRate({
        reddito: readNumber('reddito')
          + Math.max(readNumber('premiStraordinari'), 0)
          + Math.max(readNumber('altriRedditi'), 0),
        regionId: regionSelect.value,
        municipalityCode: municipalityInput.value
      });

      if (selected.region && regionSelect.value !== selected.region.id) {
        regionSelect.value = selected.region.id;
      }

      const isAutomatic = Boolean(selected.region || selected.municipality);
      addizionaliInput.disabled = true;
      if (isAutomatic) {
        addizionaliInput.value = (selected.totalRate * 100).toFixed(2);
      } else {
        addizionaliInput.value = '0.00';
      }

      // Le card regione/comune compaiono solo con un comune selezionato.
      if (!selected.municipality || !rateCards) {
        hideRateCards();
        return;
      }

      const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      };
      rateCards.setAttribute('aria-hidden', 'false');
      setText('local-tax-region-title', `Aliquota regionale — ${selected.region?.name || '-'}`);
      setText('local-tax-region-rate', `${(selected.regionalRate * 100).toFixed(2)}%`);
      setText('local-tax-municipal-title', `Aliquota comunale — ${selected.municipality.name}`);
      setText('local-tax-municipal-rate', `${(selected.municipalRate * 100).toFixed(2)}%`);
    }

    /**
     * Aggiorna la visualizzazione dell'investimento minimo
     */
    updateMinInvestimentoDisplay(reddito, quotaMinAderentePerc, baseContributivaFpTipo = 'ral', baseContributivaFp = 0) {
      const baseContributiva = baseContributivaFpTipo === 'ral' || baseContributivaFp <= 0
        ? reddito
        : baseContributivaFp;
      const minInvestimento = Math.round(baseContributiva * quotaMinAderentePerc);
      const display = document.getElementById('min-investimento-display');
      if (display) {
        display.textContent = minInvestimento.toLocaleString('it-IT') + ' €';
      }
    }

    /**
     * Card del sottogruppo "Quota FP extra": quota oltre la minima (EUR e %)
     * e differenza tra versarla in busta o via bonifico nell'anno 1.
     */
    /**
     * Card di quote, quota extra e busta/bonifico (anno 1), calcolate sulla
     * strategia FP e mostrate identiche nel pannello e nella guidata.
     */
    updateFpSplitCards(results, config) {
      // Stessa strategia mostrata in tabella ed esploratore: un'unica storia.
      const row = this.getStrategyRows()?.[0] || results?.[0];
      if (!row) return;

      const setText = (ids, value) => {
        ids.forEach((id) => {
          const element = document.getElementById(id);
          if (element) element.textContent = value;
        });
      };
      const money = (value) => `${Math.round(value).toLocaleString('it-IT')} €`;

      const base = config.baseContributivaFpTipo === 'ral' || (config.baseContributivaFp || 0) <= 0
        ? config.reddito
        : config.baseContributivaFp;
      const quotaMinima = Math.max((base || 0) * (config.quotaMinAderentePerc || 0), 0);

      setText(['fp-quota-aderente-display', 'guided-quota-aderente-display'], money(quotaMinima));
      setText(['fp-quota-datore-display', 'guided-quota-datore-display'], money(row.Datore || 0));

      const extra = Math.max((row['FP Cons'] || 0) - quotaMinima, 0);
      const extraPerc = base > 0 ? (extra / base) * 100 : 0;
      setText(['fp-extra-quota-display', 'guided-fp-extra-quota-display'],
        `${money(extra)} · ${extraPerc.toLocaleString('it-IT', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}%`);

      // Positivo: conviene l'extra in busta; negativo: meglio il bonifico.
      const diff = Math.round(row['Diff Busta'] || 0);
      setText(['fp-split-diff-display', 'guided-fp-split-diff-display'],
        `${diff > 0 ? '+' : ''}${diff.toLocaleString('it-IT')} €`);
      const note = diff > 0
        ? "Conviene versare l'extra in busta."
        : diff < 0
          ? "Conviene versare l'extra via bonifico."
          : 'Nessuna differenza con questi input.';
      setText(['fp-split-diff-note', 'guided-fp-split-diff-note'], note);
    }

    updateInvestmentModeSummary(config, results = []) {
      const firstYear = results[0];
      if (!firstYear) return;

      const formatMoney = (value) => `${Math.round(Math.max(value, 0)).toLocaleString('it-IT')} €`;
      const investimentoAnno = this.model._applyPeriodicVariation(
        config.investimento,
        1,
        config.variazioneInvestimentoTipo,
        config.variazioneInvestimentoFrequenza,
        config.variazioneInvestimentoValore
      );
      const risparmioFiscale = firstYear.Risparmio || 0;
      const fpConsigliato = firstYear['FP Cons'] || 0;
      const pacConsigliato = firstYear['PAC Cons'] || 0;

      const grossDisplay = document.getElementById('investment-year1-gross-display');
      const taxDisplay = document.getElementById('investment-year1-tax-saving-display');
      const equivalentCard = document.getElementById('investment-year1-equivalent-card');
      const equivalentLabel = document.getElementById('investment-year1-equivalent-label');
      const equivalentDisplay = document.getElementById('investment-year1-equivalent-display');
      const explanation = document.getElementById('investment-mode-explanation');

      if (taxDisplay) taxDisplay.textContent = formatMoney(risparmioFiscale);

      if (config.modalitaConfronto === 'sacrificioNetto') {
        const pacEquivalente = Math.max(investimentoAnno - risparmioFiscale, 0);
        if (grossDisplay) grossDisplay.textContent = formatMoney(investimentoAnno);
        if (equivalentCard) equivalentCard.hidden = false;
        if (equivalentLabel) equivalentLabel.textContent = 'PAC equivalente anno 1';
        if (equivalentDisplay) equivalentDisplay.textContent = formatMoney(pacEquivalente);
        if (explanation) {
          explanation.textContent = 'Ti rientra in tasca: non viene investito.';
        }
        return;
      }

      if (grossDisplay) grossDisplay.textContent = formatMoney(investimentoAnno);
      if (equivalentCard) equivalentCard.hidden = false;
      if (equivalentLabel) equivalentLabel.textContent = 'PAC equivalente anno 1';
      if (equivalentDisplay) equivalentDisplay.textContent = formatMoney(investimentoAnno);
      if (explanation) {
        explanation.textContent = "Da reinvestire attivamente ogni anno: la simulazione lo somma al budget dall'anno successivo.";
      }
    }

    /**
     * Scarica i dati in formato CSV
     */
    downloadCsv() {
      const blob = new Blob([this.csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      link.setAttribute("href", url);
      link.setAttribute("download", "data.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
