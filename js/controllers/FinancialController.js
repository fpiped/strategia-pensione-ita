import { FinancialModel } from '../models/FinancialModel.js';
import { FinancialView } from '../views/FinancialView.js';
import { COMPARTI_FP, ETF_PRESETS } from '../constants/financial-constants.js';
import { REGIONAL_TAX_2026 } from '../constants/local-tax-data.js';
import {
  calculateLocalTaxRate,
  findMunicipalityByCode,
  searchMunicipalities
} from '../utils/local-tax-helpers.js';
import {
  buildInputWarnings,
  resolveRendimentoFp,
  resolveRendimentoPac
} from '../utils/input-helpers.js';

/**
 * FinancialController - Gestisce gli eventi e collega model e view
 */
export class FinancialController {
    constructor() {
        this.model = new FinancialModel();
        this.view = new FinancialView();
        this.tableView = 'mix';
        this.latestResults = null;
        this.inputMode = 'simple';
        this.localTaxMode = 'manual';
        this.selectedMunicipalityLabel = '';
        this.initEventListeners();
      }
  
    /**
     * Inizializza tutti gli event listener
     */
    initEventListeners() {
      document.getElementById('input-form').addEventListener('input', () => this.updateResults());
      document.getElementById('input-form').addEventListener('change', () => this.updateResults()); // Per checkbox
      document.getElementById("download-csv").addEventListener("click", () => this.downloadCsv());
      document.querySelectorAll('[data-input-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setInputMode(button.dataset.inputMode);
        });
      });
      document.getElementById('primaOccupazionePost2006').addEventListener('change', () => {
        this.updateFirstEmploymentFields();
        this.updateResults();
      });
      document.getElementById('baseContributivaFpTipo').addEventListener('change', () => {
        this.updateContributionBaseFields();
        this.updateResults();
      });
      document.getElementById('baseContributivaFp').addEventListener('input', () => {
        this.updateContributionBaseFields();
      });
      document.getElementById('reddito').addEventListener('input', () => {
        this.updateContributionBaseFields();
        this.updateLocalTaxFields();
      });
      document.querySelectorAll('[data-local-tax-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setLocalTaxMode(button.dataset.localTaxMode, { clearLocation: button.dataset.localTaxMode === 'manual' });
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
        }
      });
      document.querySelectorAll('[data-table-view]').forEach((button) => {
        button.addEventListener('click', () => {
          this.tableView = button.dataset.tableView;
          document.querySelectorAll('[data-table-view]').forEach((item) => {
            item.classList.toggle('active', item === button);
          });
          if (this.latestResults) {
            this.view.createTable(this.latestResults.results, this.tableView);
          }
        });
      });

      // Listener per cambio comparto FP
      document.getElementById('compartoFp').addEventListener('change', (e) => {
        const comparto = COMPARTI_FP[e.target.value];
        const rendimentoFpInput = document.getElementById('rendimentoAnnualeFpPerc');
        if (comparto) {
          if (e.target.value === 'custom') {
            rendimentoFpInput.disabled = false;
          } else {
            rendimentoFpInput.value = comparto.rendimentoDefault;
            rendimentoFpInput.disabled = true;
          }
          this.updateResults();
        }
      });

      // Listener per cambio ETF preset
      document.getElementById('etfPreset').addEventListener('change', (e) => {
        const etf = ETF_PRESETS[e.target.value];
        const rendimentoPacInput = document.getElementById('rendimentoAnnualePacPerc');
        if (etf) {
          if (e.target.value === 'custom') {
            rendimentoPacInput.disabled = false;
          } else {
            rendimentoPacInput.value = etf.rendimentoDefault;
            rendimentoPacInput.disabled = true;
          }
          this.updateResults();
        }
      });

      // Imposta lo stato iniziale dei campi rendimento (bloccati perché i default non sono "custom")
      document.getElementById('rendimentoAnnualeFpPerc').disabled = true;
      document.getElementById('rendimentoAnnualePacPerc').disabled = true;
      this.populateLocalTaxSelectors();
      this.setLocalTaxMode(this.localTaxMode);
      this.setInputMode(this.inputMode);
      this.updateFirstEmploymentFields();
      this.updateContributionBaseFields();
      this.updateLocalTaxFields();
    }

    setInputMode(mode) {
      this.inputMode = mode === 'advanced' ? 'advanced' : 'simple';
      const form = document.getElementById('input-form');
      form.classList.toggle('advanced-mode', this.inputMode === 'advanced');
      form.classList.toggle('simple-mode', this.inputMode !== 'advanced');
      document.querySelectorAll('[data-input-mode]').forEach((button) => {
        const active = button.dataset.inputMode === this.inputMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
  
    /**
     * Funzione principale di calcolo che raccoglie gli input e aggiorna i risultati
     */
    updateResults() {
      const readNumber = (id, fallback = 0) => {
        const value = parseFloat(document.getElementById(id).value);
        return Number.isFinite(value) ? value : fallback;
      };
      const readRadio = (name, fallback) => {
        const selected = document.querySelector(`input[name="${name}"]:checked`);
        return selected ? selected.value : fallback;
      };

      // Raccogli tutti i valori di input
      const config = {
        durata: readNumber('durata', 1),
        reddito: readNumber('reddito'),
        investimento: readNumber('investimento'),
        modalitaConfronto: document.getElementById('modalitaConfronto').value,
        variazioneRedditoTipo: readRadio('variazioneRedditoTipo', 'percentuale'),
        variazioneRedditoFrequenza: readNumber('variazioneRedditoFrequenza'),
        variazioneRedditoValore: readNumber('variazioneRedditoValore'),
        variazioneInvestimentoTipo: readRadio('variazioneInvestimentoTipo', 'percentuale'),
        variazioneInvestimentoFrequenza: readNumber('variazioneInvestimentoFrequenza'),
        variazioneInvestimentoValore: readNumber('variazioneInvestimentoValore'),

        // Percentuali contributi
        quotaDatoreFpPerc: readNumber('contribuzioneDatoreFpPerc') / 100,
        contributoDatoreFisso: readNumber('contributoDatoreFisso'),
        quotaMinAderentePerc: readNumber('quotaMinAderentePerc') / 100,
        baseContributivaFpTipo: document.getElementById('baseContributivaFpTipo').value,
        baseContributivaFp: readNumber('baseContributivaFp'),
        variazioneBaseContributivaTipo: readRadio('variazioneBaseContributivaTipo', 'percentuale'),
        variazioneBaseContributivaFrequenza: readNumber('variazioneBaseContributivaFrequenza'),
        variazioneBaseContributivaValore: readNumber('variazioneBaseContributivaValore'),
        contributiInpsPerc: readNumber('contributiInpsPerc', 9.19) / 100,
        massimaleContributivoInps: readNumber('massimaleContributivoInps', 120607),
        sogliaIvsAggiuntivo: readNumber('sogliaIvsAggiuntivo', 55448),
        aliquotaIvsAggiuntivaPerc: readNumber('aliquotaIvsAggiuntivaPerc', 1) / 100,
        addizionaliPerc: readNumber('addizionaliPerc') / 100,
        ulterioriDetrazioni: readNumber('ulterioriDetrazioni'),
        modalitaVersamentoFp: document.getElementById('modalitaVersamentoFp').value,
        trattamentoIntegrativoAttivo: document.getElementById('trattamentoIntegrativoAttivo').checked,
        trattamentoIntegrativoImporto: readNumber('trattamentoIntegrativoImporto', 1200),
        trattamentoIntegrativoSogliaMin: readNumber('trattamentoIntegrativoSogliaMin', 8500),
        trattamentoIntegrativoSogliaMax: readNumber('trattamentoIntegrativoSogliaMax', 15000),

        // Tassi di rendimento
        rendimentoAnnualeFpPerc: readNumber('rendimentoAnnualeFpPerc') / 100,
        rendimentoAnnualePacPerc: readNumber('rendimentoAnnualePacPerc') / 100,

        // Assunzioni fisse del modello
        reinvestiRisparmio: true,
        modalitaCumulativa: true,
        riscattoAnticipato: document.getElementById('riscattoAnticipato').checked,
        anzianitaPregressaFp: readNumber('anzianitaPregressaFp'),

        // Maggiorazione deduzione per prima occupazione post 2006
        primaOccupazionePost2006: document.getElementById('primaOccupazionePost2006').checked,
        plafondExtraPrimaOccupazione: readNumber('plafondExtraPrimaOccupazione'),
        anniResiduiMaggiorazione: readNumber('anniResiduiMaggiorazione', 20)
      };
  
      // Calcola i risultati usando il model
      const results = this.model.calculateResults(config);
      this.latestResults = results;
      
      // Aggiorna la view
      this.view.createTable(results.results, this.tableView);
      this.view.updateMetricsDashboard(results.results);
      this.view.updateChoiceSequence(results.results);
      this.view.updateResultExplanation(results.results);
      this.view.updateInputWarnings(buildInputWarnings(config));
      this.view.updateChart(results.results);

      // Aggiorna la visualizzazione dell'investimento minimo
      this.updateMinInvestimentoDisplay(
        config.reddito,
        config.quotaMinAderentePerc,
        config.baseContributivaFpTipo,
        config.baseContributivaFp
      );

      // Aggiorna il contenuto CSV per il download
      this.csvContent = this.model.convertToCSV(results.results);
    }

    updateFirstEmploymentFields() {
      const enabled = document.getElementById('primaOccupazionePost2006').checked;
      document.getElementById('plafondExtraPrimaOccupazione').disabled = !enabled;
      document.getElementById('anniResiduiMaggiorazione').disabled = !enabled;
    }

    updateContributionBaseFields() {
      const isRal = document.getElementById('baseContributivaFpTipo').value === 'ral';
      const reddito = parseFloat(document.getElementById('reddito').value) || 0;
      const baseInput = document.getElementById('baseContributivaFp');
      baseInput.disabled = isRal;
      baseInput.max = String(Math.max(reddito, 0));
      if (!isRal && parseFloat(baseInput.value) > reddito) {
        baseInput.value = String(Math.max(reddito, 0));
      }
      document.querySelector('.contribution-base-variation').setAttribute('aria-disabled', String(isRal));
      document.querySelectorAll(
        'input[name="variazioneBaseContributivaTipo"], #variazioneBaseContributivaFrequenza, #variazioneBaseContributivaValore'
      ).forEach((input) => {
        input.disabled = isRal;
      });
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

    updateLocalTaxFields() {
      const readNumber = (id, fallback = 0) => {
        const value = parseFloat(document.getElementById(id).value);
        return Number.isFinite(value) ? value : fallback;
      };
      const regionSelect = document.getElementById('regioneAddizionali');
      const municipalityInput = document.getElementById('comuneAddizionali');
      const addizionaliInput = document.getElementById('addizionaliPerc');
      const summary = document.getElementById('addizionali-auto-summary');
      if (!regionSelect || !municipalityInput || !addizionaliInput) return;

      if (this.localTaxMode !== 'auto') {
        addizionaliInput.disabled = false;
        if (summary) {
          summary.textContent = 'Modalità manuale attiva: modifica direttamente la percentuale addizionali.';
        }
        return;
      }

      const selected = calculateLocalTaxRate({
        reddito: readNumber('reddito'),
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
      }

      if (summary) {
        if (!isAutomatic) {
          addizionaliInput.value = '0.00';
          summary.textContent = 'Seleziona regione e, se disponibile, comune. Il Comune imposta automaticamente la Regione.';
          return;
        }
        const parts = [
          selected.region ? `Regione: ${(selected.regionalRate * 100).toFixed(2)}%` : null,
          selected.municipality ? `Comune: ${(selected.municipalRate * 100).toFixed(2)}%` : null
        ].filter(Boolean);
        summary.textContent = `${parts.join(' + ')} = ${(selected.totalRate * 100).toFixed(2)}% effettivo sul reddito impostato.`;
      }
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
