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
        this.latestResults = null;
        this.localTaxMode = 'manual';
        this.selectedMunicipalityLabel = '';
        this.guidedTaxMode = 'manual';
        this.selectedGuidedMunicipalityLabel = '';
        this.guidedStep = 0;
        this.contributionSummaryYear = 1;
        this.updateResultsTimer = null;
        this.initEventListeners();
      }
  
    /**
     * Inizializza tutti gli event listener
     */
    initEventListeners() {
      const shouldIgnoreFormUpdate = (event) => event.target?.id === 'contribution-summary-year';
      document.getElementById('input-form').addEventListener('input', (event) => {
        if (shouldIgnoreFormUpdate(event)) return;
        if (event.target?.type === 'number') {
          this.scheduleResultsUpdate(200);
          return;
        }
        this.updateResults();
      });
      document.getElementById('input-form').addEventListener('change', (event) => {
        if (shouldIgnoreFormUpdate(event)) return;
        this.updateResults();
      }); // Per checkbox
      document.getElementById("download-csv").addEventListener("click", () => this.downloadCsv());
      document.getElementById('open-guided-mode').addEventListener('click', () => this.openGuidedMode());
      const updateSummaryYear = (event) => {
        event.stopPropagation();
        this.contributionSummaryYear = parseInt(event.target.value, 10) || 1;
        if (this.latestResults?.config) {
          this.updateContributionSummary(this.latestResults.config, this.latestResults.results);
        }
      };
      document.getElementById('contribution-summary-year').addEventListener('input', updateSummaryYear);
      document.getElementById('contribution-summary-year').addEventListener('change', updateSummaryYear);
      document.querySelectorAll('[data-guided-close]').forEach((element) => {
        element.addEventListener('click', () => this.closeGuidedMode());
      });
      document.getElementById('guided-prev').addEventListener('click', () => this.setGuidedStep(this.guidedStep - 1));
      document.getElementById('guided-next').addEventListener('click', () => this.setGuidedStep(this.guidedStep + 1));
      document.getElementById('guided-finish').addEventListener('click', () => this.applyGuidedMode());
      document.querySelectorAll('input[name^="guided-variazione-"]').forEach((input) => {
        input.addEventListener('change', () => this.updateGuidedContributionPreview());
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
          this.updateGuidedFirstEmploymentFields();
          this.updateGuidedContributionPreview();
          this.updateGuidedLocalTaxFields();
        });
        input.addEventListener('change', () => {
          this.updateGuidedFirstEmploymentFields();
          this.updateGuidedContributionPreview();
          this.updateGuidedLocalTaxFields();
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
      document.querySelectorAll('[data-reset-variation]').forEach((button) => {
        button.addEventListener('click', () => {
          this.resetVariation(button.dataset.resetVariation);
          this.updateResults();
        });
      });
      document.getElementById('contributiInpsPreset').addEventListener('change', () => {
        this.updateInpsContributionFields();
        this.updateResults();
      });
      document.getElementById('guided-contributi-inps-preset').addEventListener('change', () => {
        this.updateGuidedInpsContributionFields();
        this.updateGuidedContributionPreview();
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
          this.hideGuidedMunicipalitySuggestions();
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

      document.getElementById('rendimentoFpMode').addEventListener('change', () => this.updateResults());
      document.getElementById('rendimentoPacMode').addEventListener('change', () => this.updateResults());
      this.populateLocalTaxSelectors();
      this.populateGuidedLocalTaxSelectors();
      this.setLocalTaxMode(this.localTaxMode);
      this.setGuidedTaxMode(this.guidedTaxMode);
      this.updateFirstEmploymentFields();
      this.updateContributionBaseFields();
      this.updateInpsContributionFields();
      this.updateLocalTaxFields();
      this.updateEffectiveTaxOutputs();
    }

    scheduleResultsUpdate(delay = 200) {
      window.clearTimeout(this.updateResultsTimer);
      this.updateResultsTimer = window.setTimeout(() => {
        this.updateResults();
      }, delay);
    }

    openGuidedMode() {
      this.syncGuidedFieldsFromForm();
      this.setGuidedStep(0);
      this.updateGuidedContributionPreview();
      const modal = document.getElementById('guided-modal');
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      document.getElementById('guided-reddito').focus();
    }

    closeGuidedMode() {
      const modal = document.getElementById('guided-modal');
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      document.getElementById('open-guided-mode').focus();
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
      copyValue('investimento', 'guided-investimento');
      copyValue('minimoRetributivoAnnuo', 'guided-minimo-retributivo');
      copyValue('durata', 'guided-durata');
      copyValue('variazioneRedditoFrequenza', 'guided-variazione-reddito-frequenza');
      copyValue('variazioneRedditoValore', 'guided-variazione-reddito-valore');
      copyValue('variazioneInvestimentoFrequenza', 'guided-variazione-investimento-frequenza');
      copyValue('variazioneInvestimentoValore', 'guided-variazione-investimento-valore');
      copyValue('variazioneBaseContributivaFrequenza', 'guided-variazione-base-frequenza');
      copyValue('variazioneBaseContributivaValore', 'guided-variazione-base-valore');
      copyRadio('variazioneRedditoTipo', 'guided-variazione-reddito-tipo');
      copyRadio('variazioneInvestimentoTipo', 'guided-variazione-investimento-tipo');
      copyRadio('variazioneBaseContributivaTipo', 'guided-variazione-base-tipo');
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
      document.getElementById('guided-contributi-inps-preset').value = document.getElementById('contributiInpsPreset').value;
      document.getElementById('guided-regione-addizionali').value = document.getElementById('regioneAddizionali').value;
      document.getElementById('guided-comune-addizionali').value = document.getElementById('comuneAddizionali').value;
      document.getElementById('guided-comune-addizionali-search').value = document.getElementById('comuneAddizionaliSearch').value;
      this.selectedGuidedMunicipalityLabel = document.getElementById('comuneAddizionaliSearch').value;
      this.setGuidedTaxMode(this.localTaxMode);
      this.updateGuidedInpsContributionFields();
      this.updateGuidedFirstEmploymentFields();
      this.updateGuidedReturnFields();
    }

    applyGuidedMode() {
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
      copyValue('guided-investimento', 'investimento');
      copyValue('guided-minimo-retributivo', 'minimoRetributivoAnnuo');
      copyValue('guided-durata', 'durata');
      copyValue('guided-variazione-reddito-frequenza', 'variazioneRedditoFrequenza');
      copyValue('guided-variazione-reddito-valore', 'variazioneRedditoValore');
      copyValue('guided-variazione-investimento-frequenza', 'variazioneInvestimentoFrequenza');
      copyValue('guided-variazione-investimento-valore', 'variazioneInvestimentoValore');
      copyValue('guided-variazione-base-frequenza', 'variazioneBaseContributivaFrequenza');
      copyValue('guided-variazione-base-valore', 'variazioneBaseContributivaValore');
      copyRadio('guided-variazione-reddito-tipo', 'variazioneRedditoTipo');
      copyRadio('guided-variazione-investimento-tipo', 'variazioneInvestimentoTipo');
      copyRadio('guided-variazione-base-tipo', 'variazioneBaseContributivaTipo');
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
      document.getElementById('contributiInpsPreset').value = document.getElementById('guided-contributi-inps-preset').value;
      document.getElementById('regioneAddizionali').value = document.getElementById('guided-regione-addizionali').value;
      document.getElementById('comuneAddizionali').value = document.getElementById('guided-comune-addizionali').value;
      document.getElementById('comuneAddizionaliSearch').value = document.getElementById('guided-comune-addizionali-search').value;
      this.selectedMunicipalityLabel = this.selectedGuidedMunicipalityLabel;
      this.setLocalTaxMode(this.guidedTaxMode);
      this.updateFirstEmploymentFields();
      this.updateContributionBaseFields();
      this.updateInpsContributionFields();
      this.updateLocalTaxFields();
      this.updateResults();
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

      clampGuidedNumber('guided-reddito', 0);
      clampGuidedNumber('guided-premi', 0);
      clampGuidedNumber('guided-investimento', 0);
      clampGuidedNumber('guided-minimo-retributivo', 0);
      clampGuidedNumber('guided-durata', 1, 50);
      clampGuidedNumber('guided-variazione-reddito-frequenza', 0, 50);
      clampGuidedNumber('guided-variazione-investimento-frequenza', 0, 50);
      clampGuidedNumber('guided-variazione-base-frequenza', 0, 50);
      clampGuidedNumber('guided-quota-min', 0, 100);
      clampGuidedNumber('guided-datore-perc', 0, 100);
      clampGuidedNumber('guided-addizionali', 0, 10);
      clampGuidedNumber('guided-ulteriori-detrazioni', 0);
      clampGuidedNumber('guided-contributi-inps', 0, 20);
      clampGuidedNumber('guided-anzianita', 0, 50);
      clampGuidedNumber('guided-plafond-extra', 0, 25822.85);
      this.updateGuidedFirstEmploymentFields();
      clampGuidedNumber('guided-rendimento-fp', 0, 20);
      clampGuidedNumber('guided-rendimento-pac', 0, 20);
      clampGuidedNumber('guided-costi-fp', 0, 5);
      clampGuidedNumber('guided-costi-pac', 0, 5);
      clampGuidedNumber('guided-quota-agevolata-fp', 0, 100);
      clampGuidedNumber('guided-quota-agevolata-pac', 0, 100);

      const formatMoney = (value) => `${Math.round(value).toLocaleString('it-IT')} €`;
      const formatPercent = (value) => `${value.toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}%`;
      const reddito = Math.max(readGuidedNumber('guided-reddito'), 0);
      const minimoRetributivo = Math.max(readGuidedNumber('guided-minimo-retributivo'), 0);
      const budget = Math.max(readGuidedNumber('guided-investimento'), 0);
      const quotaMinPerc = Math.max(readGuidedNumber('guided-quota-min'), 0) / 100;
      const datorePerc = Math.max(readGuidedNumber('guided-datore-perc'), 0) / 100;
      const baseTipo = document.getElementById('guided-base-tipo').value;
      const baseDatoreTipo = document.getElementById('guided-base-datore-tipo').value;
      const modalitaVersamento = document.getElementById('guided-modalita-versamento').value;

      document.getElementById('guided-minimo-retributivo').value = String(minimoRetributivo);

      const resolveBase = (type) => {
        if (type === 'minimoRetributivo' && minimoRetributivo > 0) return minimoRetributivo;
        return reddito;
      };
      const baseQuota = resolveBase(baseTipo);
      const baseDatore = resolveBase(baseDatoreTipo);
      const quotaMinima = baseQuota * quotaMinPerc;
      const datorePotenziale = baseDatore * datorePerc;
      const datoreRiconosciuto = budget >= quotaMinima ? datorePotenziale : 0;
      const limiteDeducibileOrdinario = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP;
      const quotaFpStimata = Math.min(budget, Math.max(limiteDeducibileOrdinario - datoreRiconosciuto, 0));
      const splitVersamento = this.model._chooseBestPaymentSplit({
        quotaFp: quotaFpStimata,
        quotaDatore: datoreRiconosciuto,
        quotaMinAderente: quotaMinima,
        modalitaVersamentoFp: modalitaVersamento,
        reddito: reddito + Math.max(readGuidedNumber('guided-premi'), 0),
        contributiInpsPerc: Math.max(readGuidedNumber('guided-contributi-inps', FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT * 100), 0) / 100,
        massimaleContributivoInps: FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
        sogliaIvsAggiuntivo: FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
        aliquotaIvsAggiuntivaPerc: FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO,
        addizionaliPerc: Math.max(readGuidedNumber('guided-addizionali'), 0) / 100,
        ulterioriDetrazioni: Math.max(readGuidedNumber('guided-ulteriori-detrazioni'), 0),
        limiteDeduzioneTotale: limiteDeducibileOrdinario
      });
      const quotaBusta = splitVersamento.quotaBusta;
      const quotaBonifico = Math.max(quotaFpStimata - quotaBusta, 0);
      const quotaBustaPerc = baseQuota > 0 ? (quotaBusta / baseQuota) * 100 : 0;

      document.getElementById('guided-min-contribution').textContent = formatMoney(quotaMinima);
      document.getElementById('guided-employer-contribution').textContent = formatMoney(datoreRiconosciuto);
      document.getElementById('guided-employer-status').textContent = budget >= quotaMinima
        ? 'Quota minima raggiunta'
        : `Mancano ${formatMoney(Math.max(quotaMinima - budget, 0))}`;
      document.getElementById('guided-fp-contribution').textContent = formatMoney(quotaFpStimata);
      document.getElementById('guided-payroll-contribution').textContent = formatMoney(quotaBusta);
      document.getElementById('guided-payroll-percentage').textContent = quotaBusta > 0
        ? formatPercent(quotaBustaPerc)
        : '0,00%';
      document.getElementById('guided-bank-transfer-contribution').textContent = formatMoney(quotaBonifico);
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

      // Raccogli tutti i valori di input
      const primaOccupazionePost2006 = document.getElementById('primaOccupazionePost2006').checked;
      const anzianitaPregressaFp = readNumber('anzianitaPregressaFp');

      const config = {
        durata: readNumber('durata', 1),
        reddito: readNumber('reddito'),
        premiStraordinari: readNumber('premiStraordinari'),
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
        baseDatoreFpTipo: document.getElementById('baseDatoreFpTipo').value,
        baseDatoreFp: readNumber('baseDatoreFp'),
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
        anniResiduiMaggiorazione: this.calculateFirstEmploymentRemainingYears(anzianitaPregressaFp, primaOccupazionePost2006)
      };
  
      // Calcola i risultati usando il model
      const results = this.model.calculateResults(config);
      this.latestResults = { ...results, config };
      
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
      this.updateContributionSummary(config, results.results);
      this.updateInvestmentModeSummary(config, results.results);

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
      const yearsInput = document.getElementById('anniResiduiMaggiorazione');
      document.getElementById('plafondExtraPrimaOccupazione').disabled = !enabled;
      yearsInput.value = String(this.calculateFirstEmploymentRemainingYears(
        parseFloat(document.getElementById('anzianitaPregressaFp').value) || 0,
        enabled
      ));
      yearsInput.disabled = true;
    }

    updateGuidedFirstEmploymentFields() {
      const enabled = document.getElementById('guided-prima-occupazione').checked;
      const yearsInput = document.getElementById('guided-anni-maggiorazione');
      document.getElementById('guided-plafond-extra').disabled = !enabled;
      yearsInput.value = String(this.calculateFirstEmploymentRemainingYears(
        parseFloat(document.getElementById('guided-anzianita').value) || 0,
        enabled
      ));
      yearsInput.disabled = true;
    }

    calculateFirstEmploymentRemainingYears(anzianitaPregressaFp, enabled = true) {
      if (!enabled) return 0;

      const completedYears = Math.max(Math.floor(anzianitaPregressaFp || 0), 0);
      if (completedYears < 5) return 0;

      return Math.min(
        Math.max(25 - completedYears, 0),
        FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNI
      );
    }

    resetVariation(kind) {
      const map = {
        reddito: {
          typeName: 'variazioneRedditoTipo',
          frequencyId: 'variazioneRedditoFrequenza',
          valueId: 'variazioneRedditoValore'
        },
        investimento: {
          typeName: 'variazioneInvestimentoTipo',
          frequencyId: 'variazioneInvestimentoFrequenza',
          valueId: 'variazioneInvestimentoValore'
        },
        baseContributiva: {
          typeName: 'variazioneBaseContributivaTipo',
          frequencyId: 'variazioneBaseContributivaFrequenza',
          valueId: 'variazioneBaseContributivaValore'
        }
      };
      const config = map[kind];
      if (!config) return;

      const percentRadio = document.querySelector(`input[name="${config.typeName}"][value="percentuale"]`);
      if (percentRadio) percentRadio.checked = true;
      document.getElementById(config.frequencyId).value = '0';
      document.getElementById(config.valueId).value = '0';
    }

    updateContributionBaseFields() {
      const minimoInput = document.getElementById('minimoRetributivoAnnuo');
      const rawMinimo = parseFloat(minimoInput.value) || 0;
      const minimo = Math.max(rawMinimo, 0);
      const baseInput = document.getElementById('baseContributivaFp');
      const baseDatoreInput = document.getElementById('baseDatoreFp');

      if (rawMinimo !== minimo) {
        minimoInput.value = String(minimo);
      }

      baseInput.value = String(minimo);
      baseDatoreInput.value = String(minimo);
    }

    updateContributionBaseLabels() {
      this.updateContributionBaseFields();
    }

    updateInpsContributionFields() {
      const preset = document.getElementById('contributiInpsPreset').value;
      const input = document.getElementById('contributiInpsPerc');

      if (preset === 'manuale') {
        input.disabled = false;
        return;
      }

      input.value = preset;
      input.disabled = true;
    }

    updateGuidedInpsContributionFields() {
      const preset = document.getElementById('guided-contributi-inps-preset').value;
      const input = document.getElementById('guided-contributi-inps');

      if (preset === 'manuale') {
        input.disabled = false;
        return;
      }

      input.value = preset;
      input.disabled = true;
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
      const summary = document.getElementById('guided-addizionali-summary');
      if (!regionSelect || !municipalityInput || !addizionaliInput || !summary) return;

      if (this.guidedTaxMode !== 'auto') {
        addizionaliInput.disabled = false;
        summary.textContent = 'Modalità manuale: inserisci la somma tra aliquota media regionale e aliquota media comunale.';
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

      const parts = [
        selected.region ? `Regione: ${(selected.regionalRate * 100).toFixed(2)}%` : null,
        selected.municipality ? `Comune: ${(selected.municipalRate * 100).toFixed(2)}%` : null
      ].filter(Boolean);
      summary.textContent = parts.length
        ? `${parts.join(' + ')} = ${(selected.totalRate * 100).toFixed(2)}% effettivo sul reddito impostato.`
        : 'Seleziona Regione e, se disponibile, Comune. Il Comune imposta automaticamente la Regione.';
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
          summary.textContent = 'Modalità manuale: inserisci la somma tra aliquota media regionale e aliquota media comunale.';
        }
        return;
      }

      const selected = calculateLocalTaxRate({
        reddito: readNumber('reddito') + Math.max(readNumber('premiStraordinari'), 0),
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

    updateContributionSummary(config, results = []) {
      const formatMoney = (value) => `${Math.round(Math.max(value, 0)).toLocaleString('it-IT')} €`;
      const formatPercent = (value) => `${value.toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}%`;

      const yearSelect = document.getElementById('contribution-summary-year');
      if (yearSelect) {
        const previousYear = this.contributionSummaryYear || 1;
        const currentOptions = Array.from(yearSelect.options).map((option) => option.value).join(',');
        const nextOptions = results.map((row) => String(row.Anno)).join(',');
        if (currentOptions !== nextOptions) {
          yearSelect.replaceChildren(...results.map((row) => {
            const option = document.createElement('option');
            option.value = String(row.Anno);
            option.textContent = `Anno ${row.Anno}`;
            return option;
          }));
        }
        const maxYear = results.length ? results.at(-1).Anno : 1;
        this.contributionSummaryYear = Math.min(Math.max(previousYear, 1), maxYear);
        yearSelect.value = String(this.contributionSummaryYear);
      }

      const selectedRow = results.find((row) => row.Anno === this.contributionSummaryYear) || results[0];
      if (!selectedRow) return;

      const anno = selectedRow.Anno || 1;
      const redditoAnno = this.model._applyPeriodicVariation(
        config.reddito,
        anno,
        config.variazioneRedditoTipo,
        config.variazioneRedditoFrequenza,
        config.variazioneRedditoValore
      );
      const baseQuota = this.model._resolveContributionBase({
        redditoAnno,
        anno,
        baseContributivaFpTipo: config.baseContributivaFpTipo,
        baseContributivaFp: config.baseContributivaFp,
        variazioneBaseContributivaTipo: config.variazioneBaseContributivaTipo,
        variazioneBaseContributivaFrequenza: config.variazioneBaseContributivaFrequenza,
        variazioneBaseContributivaValore: config.variazioneBaseContributivaValore
      });
      const quotaMinima = baseQuota * config.quotaMinAderentePerc;
      const datoreRiconosciuto = selectedRow.Datore || 0;
      const quotaFpConsigliata = selectedRow['FP Cons'] || 0;
      const quotaBusta = selectedRow['FP Busta'] || 0;
      const quotaBonifico = selectedRow['FP Bonifico'] || 0;
      const differenzaBustaBonifico = selectedRow['Diff Busta'] || 0;
      const quotaBustaPerc = baseQuota > 0 ? (quotaBusta / baseQuota) * 100 : 0;
      const formatSignedMoney = (value) => {
        if (Math.abs(value) < 0.5) return '0 €';
        return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value))}`;
      };
      document.getElementById('quota-minima-display').textContent = formatMoney(quotaMinima);
      document.getElementById('contributo-datore-display').textContent = formatMoney(datoreRiconosciuto);
      document.getElementById('quota-fp-consigliata-display').textContent = formatMoney(quotaFpConsigliata);
      document.getElementById('quota-busta-display').textContent = formatMoney(quotaBusta);
      document.getElementById('quota-busta-perc-display').textContent = quotaBusta > 0
        ? formatPercent(quotaBustaPerc)
        : '0,00%';
      document.getElementById('quota-bonifico-display').textContent = formatMoney(quotaBonifico);
      document.getElementById('ottimizzazione-busta-display').textContent = formatSignedMoney(differenzaBustaBonifico);
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
          explanation.textContent = `Anno 1: versi fino a ${formatMoney(investimentoAnno)} nel FP, ma il costo netto stimato è ${formatMoney(pacEquivalente)} dopo ${formatMoney(risparmioFiscale)} di beneficio fiscale. Il PAC viene quindi confrontato con quel costo netto, non con il lordo pieno.`;
        }
        return;
      }

      if (grossDisplay) grossDisplay.textContent = formatMoney(investimentoAnno);
      if (equivalentCard) equivalentCard.hidden = true;
      if (explanation) {
        explanation.textContent = `Anno 1: il mix alloca ${formatMoney(fpConsigliato)} al FP e ${formatMoney(pacConsigliato)} al PAC. Il beneficio fiscale stimato non è denaro regalato: in modalità budget annuo pianificato viene reinvestito dal ciclo successivo, senza mostrarlo come secondo importo duplicato.`;
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
