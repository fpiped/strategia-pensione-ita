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
import { createStore } from '../store.js';
import { hydrateState, bindFields, dropUnknownChoices } from '../bindings.js';
import {
  buildShareUrl,
  clearSavedScenario,
  clearSharedScenarioFromUrl,
  loadSavedScenario,
  readSharedScenario,
  saveScenario
} from '../utils/scenario-persistence.js';

const byId = (id) => document.getElementById(id);

const setText = (ids, value) => {
  (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
    const element = byId(id);
    if (element) element.textContent = value;
  });
};

// value è una frazione (0.20 -> "20,00%")
const formatPercent = (value) => `${(value * 100).toLocaleString('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}%`;

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API assente o negata (es. http in locale): textarea usa e getta.
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }
}

/**
 * FinancialController - Gestisce gli eventi e collega store, model e view.
 *
 * Tutti gli input dell'utente vivono nello store (js/store.js): i campi del
 * pannello e della modalità guidata sono due viste della stessa fonte di
 * verità, tenute allineate dai binding dichiarativi (js/bindings.js). Il
 * controller reagisce ai cambi di stato aggiornando i campi derivati e
 * ricalcolando i risultati.
 */
export class FinancialController {
    constructor() {
        this.model = new FinancialModel();
        this.view = new FinancialView();
        this.tableView = 'mix';
        // Strategia mostrata in tabella ed esploratore: mix | fp | pac.
        this.strategyView = 'mix';
        this.latestResults = null;
        this.guidedStep = 0;
        this.annualExplorerYear = 1;
        this.updateResultsTimer = null;
        this.persistTimer = null;
        this.shareFeedbackTimer = null;
        this.csvContent = '';

        this.populateLocalTaxSelectors();
        this.initVariationStates();
        // Predefiniti dell'app: base per il diff salvato/condiviso e per il
        // ripristino. localTaxMode e municipalityLabel non hanno un campo:
        // l'etichetta distingue una selezione confermata dal testo di ricerca
        // ancora in digitazione.
        this.defaultState = {
          ...hydrateState(),
          localTaxMode: 'manual',
          municipalityLabel: ''
        };
        const savedScenario = dropUnknownChoices(loadSavedScenario(this.defaultState));
        const sharedScenario = dropUnknownChoices(readSharedScenario(this.defaultState));
        this.store = createStore({
          ...this.defaultState,
          ...savedScenario,
          ...sharedScenario
        });
        if (sharedScenario) {
          // Lo scenario del link diventa quello corrente: l'URL torna pulito
          // e il salvataggio locale riparte da qui.
          clearSharedScenarioFromUrl();
          saveScenario(this.store.get(), this.defaultState);
        }
        bindFields(this.store);
        this.store.subscribe((state) => this.updateDerivedFields(state));
        this.store.subscribe(() => this.schedulePersist());
        this.initEventListeners();
        this.updateDerivedFields(this.store.get());
      }

    /**
     * Inizializza tutti gli event listener
     */
    initEventListeners() {
      // I valori sono già nello store (binding): qui resta solo la
      // schedulazione del ricalcolo, con debounce durante la digitazione.
      const form = byId('input-form');
      form.addEventListener('input', (event) => {
        if (event.target?.type === 'number') {
          this.scheduleResultsUpdate(200);
          return;
        }
        this.updateResults();
      });
      form.addEventListener('change', () => this.updateResults());
      window.addEventListener('strategia-theme-change', () => this.updateResults());

      const guidedDialog = document.querySelector('#guided-modal .guided-dialog');
      guidedDialog.addEventListener('input', (event) => {
        if (event.target?.type === 'number') {
          this.scheduleResultsUpdate(250);
          return;
        }
        this.updateResults();
      });
      guidedDialog.addEventListener('change', () => this.updateResults());

      document.querySelectorAll('[data-select-target]').forEach((button) => {
        button.addEventListener('click', () => {
          const select = byId(button.dataset.selectTarget);
          if (!select) return;
          select.value = button.dataset.selectValue;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });

      byId('download-csv').addEventListener('click', () => this.downloadCsv());
      byId('copy-share-link')?.addEventListener('click', () => this.copyShareLink());
      byId('reset-scenario')?.addEventListener('click', () => this.resetScenario());
      // Chiusura della pagina prima del debounce: salvataggio immediato.
      window.addEventListener('pagehide', () => this.persistNow());

      byId('open-guided-mode').addEventListener('click', () => this.openGuidedMode());
      document.querySelectorAll('[data-guided-close]').forEach((element) => {
        element.addEventListener('click', () => this.closeGuidedMode());
      });
      byId('guided-prev').addEventListener('click', () => this.setGuidedStep(this.guidedStep - 1));
      // I valori della guidata sono già nello store (specchio live): i
      // pulsanti di navigazione non devono applicare nulla.
      byId('guided-next').addEventListener('click', () => this.setGuidedStep(this.guidedStep + 1));
      byId('guided-finish').addEventListener('click', () => this.closeGuidedMode());

      const annualExplorerSelect = byId('annual-explorer-year');
      annualExplorerSelect?.addEventListener('change', (event) => {
        event.stopPropagation();
        this.annualExplorerYear = parseInt(event.target.value, 10) || 1;
        if (this.latestResults?.config) {
          this.view.updateAnnualExplorer(this.getStrategyRows(), this.latestResults.config, this.annualExplorerYear);
        }
        this.view.highlightTableYear(this.annualExplorerYear);
      });
      byId('grid-div')?.addEventListener('click', (event) => {
        const row = event.target.closest('tr[data-anno]');
        if (!row) return;
        const year = parseInt(row.dataset.anno, 10);
        if (!Number.isFinite(year)) return;
        this.annualExplorerYear = year;
        const yearSelect = byId('annual-explorer-year');
        if (yearSelect) yearSelect.value = String(year);
        if (this.latestResults?.config) {
          this.view.updateAnnualExplorer(this.getStrategyRows(), this.latestResults.config, year);
        }
        this.view.highlightTableYear(year);
      });

      // Addizionali locali: gli stessi controlli esistono nel pannello e
      // nella guidata, ma scrivono tutti sulle stesse chiavi dello store.
      document.querySelectorAll('[data-local-tax-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setLocalTaxMode(button.dataset.localTaxMode, { clearLocation: button.dataset.localTaxMode === 'manual' });
          this.updateResults();
        });
      });
      document.querySelectorAll('[data-guided-tax-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setLocalTaxMode(button.dataset.guidedTaxMode, { clearLocation: button.dataset.guidedTaxMode === 'manual' });
          this.updateResults();
        });
      });
      ['regioneAddizionali', 'guided-regione-addizionali'].forEach((id) => {
        byId(id).addEventListener('change', () => {
          this.store.set({
            localTaxMode: 'auto',
            comuneAddizionali: '',
            comuneAddizionaliSearch: '',
            municipalityLabel: ''
          });
        });
      });
      this.initMunicipalityAutocomplete('comuneAddizionaliSearch', 'comuneAddizionaliResults');
      this.initMunicipalityAutocomplete('guided-comune-addizionali-search', 'guided-comune-addizionali-results');
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.autocomplete-group')) {
          this.hideMunicipalitySuggestions();
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
    }

    static VARIATION_CONTROLS = [
      ['variazioneRedditoAndamento', 'variazioneRedditoFrequenza', 'variazioneRedditoValore'],
      ['variazioneInvestimentoAndamento', 'variazioneInvestimentoFrequenza', 'variazioneInvestimentoValore'],
      ['variazioneBaseContributivaAndamento', 'variazioneBaseContributivaFrequenza', 'variazioneBaseContributivaValore'],
      ['variazionePremiAndamento', 'variazionePremiFrequenza', 'variazionePremiValore'],
      ['variazioneAltriRedditiAndamento', 'variazioneAltriRedditiFrequenza', 'variazioneAltriRedditiValore']
    ];

    /**
     * Allinea lo switch Costante/Crescente ai valori correnti di frequenza/valore.
     * Eseguito prima dell'hydrate dello store, così lo stato iniziale è coerente.
     */
    initVariationStates() {
      FinancialController.VARIATION_CONTROLS.forEach(([selectId, freqId, valId]) => {
        const select = byId(selectId);
        if (!select) return;
        const freq = parseFloat(byId(freqId)?.value) || 0;
        const val = parseFloat(byId(valId)?.value) || 0;
        select.value = freq > 0 && val !== 0 ? 'crescente' : 'costante';
      });
    }

    /**
     * Aggiornamenti derivati eseguiti a ogni cambio di stato: campi calcolati,
     * visibilità condizionali e stato dei controlli, per pannello e guidata
     * insieme (stessa funzione, entrambi i set di elementi).
     */
    updateDerivedFields(state) {
      // In modalità auto l'aliquota addizionali è derivata da regione/comune:
      // se la patch cambia lo stato, il render arriva con la nuova notifica.
      if (this.applyLocalTaxAutoRate(state)) return;
      this.syncSegmentedControls();
      this.syncVariationFields();
      this.updateContributionBaseFields(state);
      this.updateReturnFields(state);
      this.updateLocalTaxUi(state);
    }

    /**
     * Mostra i campi aumento solo con andamento Crescente e tiene
     * l'unità del valore coerente con il tipo scelto (% / EUR).
     */
    syncVariationFields() {
      document.querySelectorAll('select[data-variation-fields]').forEach((select) => {
        const fields = byId(select.dataset.variationFields);
        if (fields) fields.hidden = select.value !== 'crescente';
      });
      document.querySelectorAll('[data-unit-for]').forEach((unit) => {
        const tipo = document.querySelector(`input[name="${unit.dataset.unitFor}"]:checked`);
        unit.textContent = tipo?.value === 'euro' ? 'EUR' : '%';
      });
    }

    syncSegmentedControls() {
      document.querySelectorAll('.native-select[id]').forEach((select) => {
        document.querySelectorAll(`[data-select-target="${select.id}"]`).forEach((button) => {
          const isActive = button.dataset.selectValue === select.value;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-pressed', String(isActive));
        });
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

    schedulePersist(delay = 300) {
      window.clearTimeout(this.persistTimer);
      this.persistTimer = window.setTimeout(() => this.persistNow(), delay);
    }

    persistNow() {
      window.clearTimeout(this.persistTimer);
      saveScenario(this.store.get(), this.defaultState);
    }

    /**
     * Copia negli appunti un link che riproduce lo scenario corrente; solo i
     * parametri diversi dai predefiniti finiscono nell'URL.
     */
    async copyShareLink() {
      const url = buildShareUrl(this.store.get(), this.defaultState);
      const copied = await copyTextToClipboard(url);
      const label = document.querySelector('#copy-share-link [data-share-label]');
      if (!label) return;
      label.textContent = copied ? 'Link copiato!' : 'Copia non riuscita';
      window.clearTimeout(this.shareFeedbackTimer);
      this.shareFeedbackTimer = window.setTimeout(() => {
        label.textContent = 'Condividi scenario';
      }, 2000);
    }

    /**
     * Riporta tutti i parametri ai predefiniti e azzera lo scenario salvato.
     */
    resetScenario() {
      if (!window.confirm('Ripristinare i valori predefiniti? I parametri attuali andranno persi.')) return;
      clearSavedScenario();
      this.store.set({ ...this.defaultState });
      this.updateResults();
    }

    openGuidedMode() {
      this.setGuidedStep(0);
      const modal = byId('guided-modal');
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      byId('guided-durata').focus({ preventScroll: true });
    }

    closeGuidedMode() {
      const modal = byId('guided-modal');
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      byId('open-guided-mode').focus({ preventScroll: true });
    }

    setGuidedStep(step) {
      const steps = [...document.querySelectorAll('.guided-step')];
      this.guidedStep = Math.min(Math.max(step, 0), steps.length - 1);

      steps.forEach((item, index) => {
        item.classList.toggle('active', index === this.guidedStep);
      });

      byId('guided-step-counter').textContent = `Step ${this.guidedStep + 1} di ${steps.length}`;
      byId('guided-progress-bar').style.width = `${((this.guidedStep + 1) / steps.length) * 100}%`;
      byId('guided-prev').disabled = this.guidedStep === 0;
      byId('guided-next').style.display = this.guidedStep === steps.length - 1 ? 'none' : 'inline-flex';
      byId('guided-finish').style.display = this.guidedStep === steps.length - 1 ? 'inline-flex' : 'none';
    }

    /**
     * Funzione principale di calcolo: costruisce la config dallo store e
     * aggiorna i risultati.
     */
    updateResults() {
      window.clearTimeout(this.updateResultsTimer);
      const state = this.store.get();
      // Con andamento Costante gli aumenti non devono entrare nel modello.
      const variation = (andamentoKey, valueKey) => (
        state[andamentoKey] === 'crescente' ? state[valueKey] : 0
      );
      const baseContributiva = Math.max(state.minimoRetributivoAnnuo, 0);

      const config = {
        durata: state.durata || 1,
        reddito: state.reddito,
        premiStraordinari: state.premiStraordinari,
        altriRedditi: state.altriRedditi,
        variazionePremiTipo: state.variazionePremiTipo,
        variazionePremiFrequenza: variation('variazionePremiAndamento', 'variazionePremiFrequenza'),
        variazionePremiValore: variation('variazionePremiAndamento', 'variazionePremiValore'),
        variazioneAltriRedditiTipo: state.variazioneAltriRedditiTipo,
        variazioneAltriRedditiFrequenza: variation('variazioneAltriRedditiAndamento', 'variazioneAltriRedditiFrequenza'),
        variazioneAltriRedditiValore: variation('variazioneAltriRedditiAndamento', 'variazioneAltriRedditiValore'),
        investimento: state.investimento,
        modalitaConfronto: state.modalitaConfronto,
        variazioneRedditoTipo: state.variazioneRedditoTipo,
        variazioneRedditoFrequenza: variation('variazioneRedditoAndamento', 'variazioneRedditoFrequenza'),
        variazioneRedditoValore: variation('variazioneRedditoAndamento', 'variazioneRedditoValore'),
        variazioneInvestimentoTipo: state.variazioneInvestimentoTipo,
        variazioneInvestimentoFrequenza: variation('variazioneInvestimentoAndamento', 'variazioneInvestimentoFrequenza'),
        variazioneInvestimentoValore: variation('variazioneInvestimentoAndamento', 'variazioneInvestimentoValore'),

        // Percentuali contributi
        quotaDatoreFpPerc: state.contribuzioneDatoreFpPerc / 100,
        contributoDatoreFisso: state.contributoDatoreFisso,
        quotaMinAderentePerc: state.quotaMinAderentePerc / 100,
        baseContributivaFpTipo: state.baseContributivaFpTipo,
        // Base alternativa alla RAL: coincide con il minimo retributivo annuo.
        baseContributivaFp: baseContributiva,
        baseDatoreFpTipo: state.baseDatoreFpTipo,
        baseDatoreFp: baseContributiva,
        variazioneBaseContributivaTipo: state.variazioneBaseContributivaTipo,
        variazioneBaseContributivaFrequenza: variation('variazioneBaseContributivaAndamento', 'variazioneBaseContributivaFrequenza'),
        variazioneBaseContributivaValore: variation('variazioneBaseContributivaAndamento', 'variazioneBaseContributivaValore'),
        contributiInpsPerc: state.contributiInpsPerc / 100,
        massimaleContributivoInps: state.massimaleContributivoInps,
        sogliaIvsAggiuntivo: state.sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc: state.aliquotaIvsAggiuntivaPerc / 100,
        addizionaliPerc: state.addizionaliPerc / 100,
        ulterioriDetrazioni: state.ulterioriDetrazioni,
        modalitaVersamentoFp: state.modalitaVersamentoFp,

        // Tassi di rendimento
        rendimentoAnnualeFpPerc: state.rendimentoAnnualeFpPerc / 100,
        rendimentoAnnualePacPerc: state.rendimentoAnnualePacPerc / 100,
        rendimentoFpMode: state.rendimentoFpMode,
        costiAnnuiFpPerc: state.costiAnnuiFpPerc / 100,
        quotaAgevolataFpPerc: state.quotaAgevolataFpPerc / 100,
        rendimentoPacMode: state.rendimentoPacMode,
        costiAnnuiPacPerc: state.costiAnnuiPacPerc / 100,
        quotaAgevolataPacPerc: state.quotaAgevolataPacPerc / 100,
        rendimentoNettoFpEffettivo: this.calculateComparableNetReturn('fp') / 100,
        rendimentoNettoPacEffettivo: this.calculateComparableNetReturn('pac') / 100,

        // Assunzioni fisse del modello
        reinvestiRisparmio: true,
        modalitaCumulativa: true,
        riscattoAnticipato: state.riscattoAnticipato,
        anzianitaPregressaFp: state.anzianitaPregressaFp
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

    /**
     * Card informative dei rendimenti (tassa effettiva e netto calcolato) e
     * visibilità dei campi extra in modalità Lordo, per pannello e guidata.
     */
    updateReturnFields(state) {
      const fpIsGross = state.rendimentoFpMode === 'lordo';
      const pacIsGross = state.rendimentoPacMode === 'lordo';
      const panelExtraFp = document.querySelector('[data-return-extra="fp"]');
      const panelExtraPac = document.querySelector('[data-return-extra="pac"]');
      const panelNetNotePac = document.querySelector('[data-return-net-note="pac"]');
      if (panelExtraFp) panelExtraFp.hidden = !fpIsGross;
      if (panelExtraPac) panelExtraPac.hidden = !pacIsGross;
      if (panelNetNotePac) panelNetNotePac.hidden = pacIsGross;
      document.querySelectorAll('[data-guided-return-extra="fp"]').forEach((element) => {
        element.hidden = !fpIsGross;
      });
      document.querySelectorAll('[data-guided-return-extra="pac"]').forEach((element) => {
        element.hidden = !pacIsGross;
      });

      const quotaFpAgevolata = fpIsGross ? state.quotaAgevolataFpPerc / 100 : 0;
      const quotaPacAgevolata = pacIsGross ? state.quotaAgevolataPacPerc / 100 : 0;
      const costiFp = fpIsGross ? state.costiAnnuiFpPerc : 0;
      const costiPac = pacIsGross ? state.costiAnnuiPacPerc : 0;
      const tassaFp = (quotaFpAgevolata * 0.125) + ((1 - quotaFpAgevolata) * 0.20);
      const tassaPac = (quotaPacAgevolata * 0.125) + ((1 - quotaPacAgevolata) * 0.26);

      setText(['tassaEffettivaFp', 'guided-tassa-effettiva-fp'], formatPercent(tassaFp));
      setText(['tassaEffettivaPac', 'guided-tassa-effettiva-pac'], formatPercent(tassaPac));
      setText(['rendimentoNettoFp', 'guided-rendimento-netto-fp'], formatPercent(
        this.calculateNetReturnFromValues(state.rendimentoAnnualeFpPerc, costiFp, tassaFp) / 100
      ));
      setText(['rendimentoNettoPac', 'guided-rendimento-netto-pac'], formatPercent(
        this.calculateNetReturnFromValues(state.rendimentoAnnualePacPerc, costiPac, tassaPac) / 100
      ));
    }

    calculateComparableNetReturn(kind) {
      const state = this.store.get();
      const isFp = kind === 'fp';
      const mode = isFp ? state.rendimentoFpMode : state.rendimentoPacMode;
      const grossReturn = isFp ? state.rendimentoAnnualeFpPerc : state.rendimentoAnnualePacPerc;
      if (mode !== 'lordo') return grossReturn;

      const costs = isFp ? state.costiAnnuiFpPerc : state.costiAnnuiPacPerc;
      const quotaAgevolata = Math.min(Math.max((isFp ? state.quotaAgevolataFpPerc : state.quotaAgevolataPacPerc) / 100, 0), 1);
      const ordinaryTax = isFp ? 0.20 : 0.26;
      const taxRate = (quotaAgevolata * 0.125) + ((1 - quotaAgevolata) * ordinaryTax);
      return this.calculateNetReturnFromValues(grossReturn, costs, taxRate);
    }

    calculateNetReturnFromValues(grossReturnPerc, annualCostsPerc, taxRate) {
      const grossReturn = Math.max(grossReturnPerc, 0) / 100;
      const annualCosts = Math.min(Math.max(annualCostsPerc, 0), 100) / 100;
      const safeTaxRate = Math.min(Math.max(taxRate, 0), 1);
      return ((((1 + (grossReturn * (1 - safeTaxRate))) * (1 - annualCosts)) - 1) * 100);
    }

    // Campi minimo retributivo visibili solo se una delle basi lo usa.
    updateContributionBaseFields(state) {
      const usesMinimumWage = state.baseContributivaFpTipo === 'minimoRetributivo'
        || state.baseDatoreFpTipo === 'minimoRetributivo';
      const minimumFields = byId('minimum-wage-fields');
      if (minimumFields) minimumFields.hidden = !usesMinimumWage;
      const guidedMinimumFields = byId('guided-minimum-wage-fields');
      if (guidedMinimumFields) guidedMinimumFields.hidden = !usesMinimumWage;
    }

    populateLocalTaxSelectors() {
      const options = () => [
        new Option('Seleziona regione', ''),
        ...[...REGIONAL_TAX_2026]
          .sort((a, b) => a.name.localeCompare(b.name, 'it'))
          .map((region) => new Option(region.name, region.id))
      ];
      ['regioneAddizionali', 'guided-regione-addizionali'].forEach((id) => {
        byId(id)?.replaceChildren(...options());
      });
    }

    setLocalTaxMode(mode, { clearLocation = false } = {}) {
      const patch = { localTaxMode: mode === 'auto' ? 'auto' : 'manual' };
      if (clearLocation) {
        Object.assign(patch, {
          regioneAddizionali: '',
          comuneAddizionali: '',
          comuneAddizionaliSearch: '',
          municipalityLabel: ''
        });
        this.hideMunicipalitySuggestions();
      }
      this.store.set(patch);
    }

    /**
     * In modalità auto l'aliquota addizionali è un valore derivato da
     * regione/comune (+ eventuale regione dedotta dal comune scelto).
     * @returns {boolean} true se lo stato è stato aggiornato (nuova notifica in coda)
     */
    applyLocalTaxAutoRate(state) {
      if (state.localTaxMode !== 'auto') return false;

      const selected = this.getSelectedLocalTax(state);
      const patch = {};
      if (selected.region && state.regioneAddizionali !== selected.region.id) {
        patch.regioneAddizionali = selected.region.id;
      }
      const isAutomatic = Boolean(selected.region || selected.municipality);
      const rate = isAutomatic ? Number((selected.totalRate * 100).toFixed(2)) : 0;
      if (state.addizionaliPerc !== rate) {
        patch.addizionaliPerc = rate;
      }
      return this.store.set(patch);
    }

    getSelectedLocalTax(state) {
      return calculateLocalTaxRate({
        reddito: state.reddito
          + Math.max(state.premiStraordinari, 0)
          + Math.max(state.altriRedditi, 0),
        regionId: state.regioneAddizionali,
        municipalityCode: state.comuneAddizionali
      });
    }

    /**
     * Stato dei controlli addizionali (pulsanti, campi auto/manuale, card
     * aliquote) per pannello e guidata.
     */
    updateLocalTaxUi(state) {
      const isAuto = state.localTaxMode === 'auto';
      const panel = byId('local-tax-panel');
      if (panel) panel.dataset.localTaxModeCurrent = state.localTaxMode;

      ['data-local-tax-mode', 'data-guided-tax-mode'].forEach((attribute) => {
        document.querySelectorAll(`[${attribute}]`).forEach((button) => {
          const active = button.getAttribute(attribute) === state.localTaxMode;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
      });
      document.querySelectorAll('.local-tax-auto-fields, .guided-tax-auto-fields').forEach((element) => {
        element.setAttribute('aria-hidden', String(!isAuto));
      });
      document.querySelectorAll('.local-tax-manual-fields, .guided-tax-manual-fields').forEach((element) => {
        element.setAttribute('aria-hidden', String(isAuto));
      });
      const addizionaliInput = byId('addizionaliPerc');
      if (addizionaliInput) addizionaliInput.disabled = isAuto;
      const guidedAddizionaliInput = byId('guided-addizionali');
      if (guidedAddizionaliInput) guidedAddizionaliInput.disabled = isAuto;

      // Le card regione/comune compaiono solo con un comune selezionato.
      const selected = isAuto ? this.getSelectedLocalTax(state) : null;
      const showCards = Boolean(selected?.municipality);
      [
        ['local-tax-rate-cards', 'local-tax-region-title', 'local-tax-region-rate', 'local-tax-municipal-title', 'local-tax-municipal-rate'],
        ['guided-local-tax-rate-cards', 'guided-local-tax-region-title', 'guided-local-tax-region-rate', 'guided-local-tax-municipal-title', 'guided-local-tax-municipal-rate']
      ].forEach(([cardsId, regionTitleId, regionRateId, municipalTitleId, municipalRateId]) => {
        const cards = byId(cardsId);
        if (!cards) return;
        cards.setAttribute('aria-hidden', String(!showCards));
        if (!showCards) return;
        setText(regionTitleId, `Aliquota regionale — ${selected.region?.name || '-'}`);
        setText(regionRateId, `${(selected.regionalRate * 100).toFixed(2)}%`);
        setText(municipalTitleId, `Aliquota comunale — ${selected.municipality.name}`);
        setText(municipalRateId, `${(selected.municipalRate * 100).toFixed(2)}%`);
      });
    }

    static AUTOCOMPLETE_WIDGETS = [
      ['comuneAddizionaliSearch', 'comuneAddizionaliResults'],
      ['guided-comune-addizionali-search', 'guided-comune-addizionali-results']
    ];

    initMunicipalityAutocomplete(searchId, resultsId) {
      const input = byId(searchId);
      if (!input) return;
      input.addEventListener('input', () => {
        const patch = { localTaxMode: 'auto' };
        // Il testo digitato diverge dall'ultima selezione: il comune scelto
        // non è più valido finché non se ne conferma uno nuovo.
        if (input.value !== this.store.get().municipalityLabel) {
          patch.comuneAddizionali = '';
        }
        this.store.set(patch);
        this.renderMunicipalitySuggestions(searchId, resultsId, input.value);
      });
      input.addEventListener('focus', () => {
        this.renderMunicipalitySuggestions(searchId, resultsId, input.value);
      });
    }

    renderMunicipalitySuggestions(searchId, resultsId, query) {
      const results = byId(resultsId);
      const input = byId(searchId);
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
          });
          results.appendChild(option);
        });
      }

      results.classList.add('is-visible');
      input.setAttribute('aria-expanded', 'true');
    }

    hideMunicipalitySuggestions() {
      FinancialController.AUTOCOMPLETE_WIDGETS.forEach(([searchId, resultsId]) => {
        byId(resultsId)?.classList.remove('is-visible');
        byId(searchId)?.setAttribute('aria-expanded', 'false');
      });
    }

    selectMunicipality(municipalityCode) {
      const municipality = findMunicipalityByCode(municipalityCode);
      if (!municipality) return;

      const label = `${municipality.name} (${municipality.province})`;
      this.store.set({
        localTaxMode: 'auto',
        comuneAddizionali: municipality.code,
        comuneAddizionaliSearch: label,
        municipalityLabel: label
      });
      this.hideMunicipalitySuggestions();
      this.updateResults();
    }

    /**
     * Aggiorna la visualizzazione dell'investimento minimo
     */
    updateMinInvestimentoDisplay(reddito, quotaMinAderentePerc, baseContributivaFpTipo = 'ral', baseContributivaFp = 0) {
      const baseContributiva = baseContributivaFpTipo === 'ral' || baseContributivaFp <= 0
        ? reddito
        : baseContributivaFp;
      const minInvestimento = Math.round(baseContributiva * quotaMinAderentePerc);
      setText('min-investimento-display', minInvestimento.toLocaleString('it-IT') + ' €');
    }

    /**
     * Card di quote, quota extra e busta/bonifico (anno 1), calcolate sulla
     * strategia FP e mostrate identiche nel pannello e nella guidata.
     */
    updateFpSplitCards(results, config) {
      // Stessa strategia mostrata in tabella ed esploratore: un'unica storia.
      const row = this.getStrategyRows()?.[0] || results?.[0];
      if (!row) return;

      const money = (value) => `${Math.round(value).toLocaleString('it-IT')} €`;

      const base = config.baseContributivaFpTipo === 'ral' || (config.baseContributivaFp || 0) <= 0
        ? config.reddito
        : config.baseContributivaFp;
      const quotaMinima = Math.max((base || 0) * (config.quotaMinAderentePerc || 0), 0);

      setText(['fp-quota-aderente-display', 'guided-quota-aderente-display'], money(quotaMinima));
      setText(['fp-quota-datore-display', 'guided-quota-datore-display'], money(row.quotaDatore || 0));

      const extra = Math.max((row.quotaFpConsigliata || 0) - quotaMinima, 0);
      const extraPerc = base > 0 ? (extra / base) * 100 : 0;
      setText(['fp-extra-quota-display', 'guided-fp-extra-quota-display'],
        `${money(extra)} · ${extraPerc.toLocaleString('it-IT', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}%`);

      // Positivo: conviene l'extra in busta; negativo: meglio il bonifico.
      const diff = Math.round(row.diffBustaBonifico || 0);
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
      const risparmioFiscale = firstYear.risparmioFiscale || 0;

      const equivalentCard = byId('investment-year1-equivalent-card');
      if (equivalentCard) equivalentCard.hidden = false;
      setText('investment-year1-gross-display', formatMoney(investimentoAnno));
      setText('investment-year1-tax-saving-display', formatMoney(risparmioFiscale));
      setText('investment-year1-equivalent-label', 'PAC equivalente anno 1');

      if (config.modalitaConfronto === 'sacrificioNetto') {
        setText('investment-year1-equivalent-display', formatMoney(Math.max(investimentoAnno - risparmioFiscale, 0)));
        setText('investment-mode-explanation', 'Ti rientra in tasca: non viene investito.');
        return;
      }

      setText('investment-year1-equivalent-display', formatMoney(investimentoAnno));
      setText('investment-mode-explanation', "Da reinvestire attivamente ogni anno: la simulazione lo somma al budget dall'anno successivo.");
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
