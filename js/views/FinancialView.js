import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';
import {
  calculateIncomeTax,
  calculateIrpefTaxableIncome
} from '../calculators/tax-calculator.js';
import { calculateEffectiveTaxRate } from '../calculators/investment-growth.js';
import { FinancialModel } from '../models/FinancialModel.js';

/**
 * FinancialView - Gestisce tutto il rendering dell'interfaccia
 */
export class FinancialView {
    constructor() {
        this.chart = null;
    }

    formatChoiceLabel(choice) {
      return choice === 'MIX' ? 'Split' : choice;
    }

    /**
     * Aggiorna il dashboard delle metriche con i valori di exit finali
     * @param {Array} results - Risultati dei calcoli
     */
    updateMetricsDashboard(results) {
      if (!results.length) return;

      // Ottieni l'ultima riga (risultati dell'anno finale)
      const lastResult = results[results.length - 1];

      // Estrai i valori di exit
      const exitFP = lastResult['Exit FP'] || 0;
      const exitPAC = lastResult['Exit PAC'] || 0;

      // Aggiorna le card delle metriche
      document.getElementById('metric-fp-value').textContent = this.formatMoney(exitFP);
      document.getElementById('metric-pac-value').textContent = this.formatMoney(exitPAC);

      // Evidenzia il migliore tra i benchmark puri; l'allocazione ottimale sta nel pannello decisionale.
      const values = [
        { id: 'fp', value: exitFP, card: document.querySelector('.metric-card.metric-fp') },
        { id: 'pac', value: exitPAC, card: document.querySelector('.metric-card.metric-pac') }
      ];

      // Rimuovi la classe 'best' da tutte le card
      values.forEach(v => {
        if (v.card) v.card.classList.remove('best');
      });

      const best = values.reduce((a, b) => a.value > b.value ? a : b);
      if (best.card) {
        best.card.classList.add('best');
      }
    }

    /**
     * Crea una tabella dei risultati e la renderizza
     * @param {Array} results - Risultati dei calcoli
     * @param {string} tableView - Vista tabella: fp, pac, mix o comparison
     */
    createTable(results, tableView = 'mix', exitLabel = 'Exit ottimale') {
      if (!results.length) return;

      const columnsByView = {
        fp: [
          { key: 'Anno', label: 'Anno' },
          { key: 'Entro Ded', label: 'Quota FP' },
          { key: 'Extra Ded', label: 'Quota PAC extra' },
          { key: 'FP Busta', label: 'FP busta' },
          { key: 'FP Bonifico', label: 'FP bonifico' },
          { key: 'Datore', label: 'Datore' },
          { key: 'Risparmio', label: 'Risparmio fiscale' },
          { key: 'Exit FP', label: 'Exit FP' }
        ],
        pac: [
          { key: 'Anno', label: 'Anno' },
          { key: 'Aderente', label: 'Quota PAC' },
          { key: 'Exit PAC', label: 'Exit PAC' }
        ],
        mix: [
          { key: 'Anno', label: 'Anno' },
          { key: 'Scelta', label: 'Scelta' },
          { key: 'FP Cons', label: 'Quota FP' },
          { key: 'PAC Cons', label: 'Quota PAC' },
          { key: 'FP Busta', label: 'FP busta' },
          { key: 'FP Bonifico', label: 'FP bonifico' },
          { key: 'Datore', label: 'Datore' },
          { key: 'Risparmio', label: 'Risparmio fiscale' },
          { key: 'Exit Mix', label: exitLabel }
        ],
        comparison: [
          { key: 'Anno', label: 'Anno' },
          { key: 'Exit FP', label: 'FP deducibile' },
          { key: 'Exit PAC', label: 'Tutto PAC' },
          { key: 'Exit Mix', label: 'Allocazione ottimale' }
        ]
      };
      const columns = columnsByView[tableView] || columnsByView.mix;

      const rows = results.map(result => {
        const row = {};
        columns.forEach(({ key, label }) => {
          let value = result[key];
          if (key === 'Scelta') {
            value = this.formatChoiceLabel(value);
          }
          if (key !== 'Anno' && typeof value === 'number') {
            value = this.formatMoney(value);
          }
          row[label] = value;
        });
        return row;
      });

      const table = document.createElement('table');
      table.id = 'output-table';
      table.className = `table-${tableView}`;

      // Crea l'header della tabella
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (const key in rows[0]) {
        const headerCell = document.createElement('th');
        headerCell.textContent = key;
        headerRow.appendChild(headerCell);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Crea il body della tabella
      const tbody = document.createElement('tbody');
      rows.forEach(row => {
        const newRow = document.createElement('tr');
        newRow.dataset.anno = row.Anno;
        for (const key in row) {
          const cell = document.createElement('td');
          cell.textContent = row[key];
          newRow.appendChild(cell);
        }
        tbody.appendChild(newRow);
      });
      table.appendChild(tbody);

      // Sostituisci la tabella esistente
      const griddiv = document.getElementById("grid-div");
      while (griddiv.firstChild) {
        griddiv.removeChild(griddiv.firstChild);
      }
      griddiv.appendChild(table);
    }

    highlightTableYear(year) {
      document.querySelectorAll('#output-table tbody tr').forEach((row) => {
        row.classList.toggle('active', Number(row.dataset.anno) === year);
      });
    }

    updateChoiceSequence(results) {
      const element = document.getElementById('metric-sequence-value');
      const subtitle = document.getElementById('metric-sequence-subtitle');
      if (!element || !results.length) return;

      const intervals = [];
      let current = {
        start: results[0].Anno,
        end: results[0].Anno,
        choice: results[0].Scelta
      };

      for (let i = 1; i < results.length; i++) {
        const row = results[i];
        if (row.Scelta === current.choice) {
          current.end = row.Anno;
        } else {
          intervals.push(current);
          current = { start: row.Anno, end: row.Anno, choice: row.Scelta };
        }
      }
      intervals.push(current);

      element.textContent = intervals
        .map(interval => {
          const range = interval.start === interval.end
            ? `Anno ${interval.start}`
            : `${interval.start}-${interval.end}`;
          return `${range}: ${this.formatChoiceLabel(interval.choice)}`;
        })
        .join(' · ');

      if (subtitle) {
        subtitle.textContent = intervals.length === 1
          ? 'Stessa scelta per tutta la durata'
          : 'Quando cambia la scelta annuale';
      }
    }

    updateResultExplanation(results) {
      const summary = document.getElementById('result-explanation-summary');
      const primaryGrid = document.getElementById('result-primary-grid');
      const secondaryGrid = document.getElementById('result-secondary-grid');
      const bestValue = document.getElementById('result-best-value');
      const bestDelta = document.getElementById('result-best-delta');
      if (!summary || !primaryGrid || !secondaryGrid || !results.length) return;

      const sum = (key) => results.reduce((total, row) => total + (row[key] || 0), 0);
      const formatSignedMoney = (value) => `${value >= 0 ? '+' : '-'}${this.formatMoney(Math.abs(Math.round(value)))}`;
      const formatPercent = (value) => `${value.toLocaleString('it-IT', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}%`;

      const lastResult = results[results.length - 1];
      const exitFP = lastResult['Exit FP'] || 0;
      const exitPAC = lastResult['Exit PAC'] || 0;
      const optimalExit = lastResult['Exit Mix'] || 0;
      const pureBenchmarks = [
        { key: 'FP', label: 'FP deducibile', value: exitFP },
        { key: 'PAC', label: 'Tutto PAC', value: exitPAC }
      ].sort((a, b) => b.value - a.value);
      const bestPure = pureBenchmarks[0];
      const worstPure = pureBenchmarks[1];
      const optimalVsBestPure = optimalExit - bestPure.value;
      const optimalVsWorstPure = optimalExit - worstPure.value;
      const optimalVsFp = optimalExit - exitFP;
      const optimalVsPac = optimalExit - exitPAC;
      const firstRow = results[0];
      const lastChoice = lastResult.Scelta || 'MIX';

      const totals = {
        fp: sum('FP Cons'),
        pac: sum('PAC Cons'),
        datore: sum('Datore'),
        risparmio: sum('Risparmio'),
        differenzaBustaBonifico: sum('Diff Busta'),
        fpBusta: sum('FP Busta'),
        fpBonifico: sum('FP Bonifico'),
        deducibile: sum('Entro Ded'),
        extraPac: sum('Extra Ded')
      };
      const totalInvested = totals.fp + totals.pac;
      const fpShare = totalInvested > 0 ? (totals.fp / totalInvested) * 100 : 0;
      const pacShare = totalInvested > 0 ? (totals.pac / totalInvested) * 100 : 0;
      const usedEmployerYears = results.filter(row => (row.Datore || 0) > 0).length;
      const payrollShare = totals.fp > 0 ? (totals.fpBusta / totals.fp) * 100 : 0;

      const yearsByChoice = results.reduce((acc, row) => {
        const choice = row.Scelta || 'MIX';
        acc[choice] = (acc[choice] || 0) + 1;
        return acc;
      }, {});

      const choiceSummary = ['FP', 'PAC', 'MIX']
        .filter(choice => yearsByChoice[choice])
        .map(choice => `${yearsByChoice[choice]} anni ${this.formatChoiceLabel(choice)}`)
        .join(' · ');

      const firstSplitDetail = firstRow
        ? `Anno 1: ${this.formatMoney(firstRow['FP Cons'] || 0)} FP e ${this.formatMoney(firstRow['PAC Cons'] || 0)} PAC`
        : 'Nessuna quota allocata';
      const bustaDetail = totals.fp > 0
        ? `${this.formatMoney(Math.round(totals.fpBusta))} busta, ${this.formatMoney(Math.round(totals.fpBonifico))} bonifico`
        : 'Nessun versamento FP nell\'allocazione ottimale';
      const optimizationDetail = totals.differenzaBustaBonifico > 0
        ? `${formatSignedMoney(totals.differenzaBustaBonifico)} rispetto a quota minima in busta + extra via bonifico: portare l'extra in busta aumenta il beneficio fiscale.`
        : totals.differenzaBustaBonifico < 0
          ? `${formatSignedMoney(totals.differenzaBustaBonifico)} rispetto a quota minima in busta + extra via bonifico: l'extra in busta peggiora il beneficio fiscale nello scenario impostato.`
          : 'Nessuna differenza fiscale netta tra extra in busta ed extra via bonifico nello scenario impostato.';
      const optimizationDetailText = `Rispetto a FP: ${formatSignedMoney(optimalVsFp)} · rispetto a PAC: ${formatSignedMoney(optimalVsPac)}`;
      const timingDetail = lastChoice === 'FP'
        ? 'Negli ultimi anni pesa di più il vantaggio fiscale immediato del FP.'
        : lastChoice === 'PAC'
          ? 'Anche verso fine periodo il rendimento PAC resta sufficiente nello scenario impostato.'
          : 'Lo split resta utile quando conviene prendere incentivi FP senza rinunciare del tutto al PAC.';

      summary.textContent = optimalVsBestPure > 0
        ? `L'allocazione ottimale chiude a ${this.formatMoney(Math.round(optimalExit))}, circa ${this.formatMoney(Math.round(optimalVsBestPure))} sopra ${bestPure.label}. ${timingDetail}`
        : `L'allocazione ottimale coincide sostanzialmente con ${bestPure.label} nello scenario impostato. ${timingDetail}`;

      if (bestValue) bestValue.textContent = this.formatMoney(Math.round(optimalExit));
      if (bestDelta) {
        bestDelta.textContent = optimalVsBestPure > 0
          ? `${this.formatMoney(Math.round(optimalVsBestPure))} sopra ${bestPure.label}; ${this.formatMoney(Math.round(optimalVsWorstPure))} sopra ${worstPure.label}.`
          : `Sostanzialmente allineata a ${bestPure.label}; ${this.formatMoney(Math.round(optimalVsWorstPure))} sopra ${worstPure.label}.`;
      }

      const primaryCards = [
        {
          icon: 'scale',
          label: 'Vantaggio finale',
          value: optimalVsBestPure > 0 ? formatSignedMoney(optimalVsBestPure) : 'Quasi pari',
          detail: optimizationDetailText
        },
        {
          icon: 'pie-chart',
          label: 'Dove vanno i versamenti',
          value: `${formatPercent(fpShare)} FP · ${formatPercent(pacShare)} PAC`,
          detail: `${firstSplitDetail}. Extra oltre deduzione nel PAC: ${this.formatMoney(Math.round(totals.extraPac))}`
        },
        {
          icon: 'hand-coins',
          label: 'Incentivi agganciati al FP',
          value: this.formatMoney(Math.round(totals.datore + totals.risparmio)),
          detail: `${this.formatMoney(Math.round(totals.datore))} datore + ${this.formatMoney(Math.round(totals.risparmio))} beneficio fiscale. Datore preso per ${usedEmployerYears}/${results.length} anni`
        },
        {
          icon: 'file-text',
          label: 'Busta vs bonifico',
          value: totals.fp > 0
            ? formatSignedMoney(totals.differenzaBustaBonifico)
            : 'Nessun FP',
          detail: totals.fp <= 0
            ? 'Nessun versamento FP.'
            : totals.differenzaBustaBonifico > 0
              ? "Conviene versare l'extra in busta."
              : totals.differenzaBustaBonifico < 0
                ? "Conviene versare l'extra via bonifico."
                : 'Nessuna differenza con questi input.'
        }
      ];

      const secondaryCards = [
        {
          icon: 'filter',
          label: 'Limite deducibile',
          value: this.formatMoney(Math.round(totals.deducibile)),
          detail: 'Quota trattata dentro il perimetro deducibile; la parte fuori deduzione viene indirizzata al PAC.'
        },
        {
          icon: 'calendar-check',
          label: 'Scelte annuali',
          value: choiceSummary || 'Nessuna scelta',
          detail: timingDetail
        }
      ];

      const renderCard = (card, type) => {
        const item = document.createElement('article');
        item.className = `result-explanation-card result-explanation-card-${type}`;

        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.dataset.lucide = card.icon;
        icon.setAttribute('aria-hidden', 'true');

        const content = document.createElement('div');

        const label = document.createElement('div');
        label.className = 'result-explanation-label';
        label.textContent = card.label;

        const value = document.createElement('div');
        value.className = 'result-explanation-value';
        value.textContent = card.value;

        const detail = document.createElement('div');
        detail.className = 'result-explanation-detail';
        detail.textContent = card.detail;

        content.append(label, value, detail);
        item.append(icon, content);
        return item;
      };

      primaryGrid.replaceChildren(...primaryCards.map(card => renderCard(card, 'primary')));
      secondaryGrid.replaceChildren(...secondaryCards.map(card => renderCard(card, 'secondary')));
      if (window.renderSiteIcons) window.renderSiteIcons();
    }

    updateAnnualExplorer(results, config, selectedYear = 1) {
      const yearSelect = document.getElementById('annual-explorer-year');
      if (!yearSelect || !results.length || !config) return;

      const maxYear = results.at(-1).Anno || results.length;
      const safeYear = Math.min(Math.max(selectedYear || 1, 1), maxYear);
      const optionSignature = results.map((row) => row.Anno).join(',');
      if (yearSelect.dataset.options !== optionSignature) {
        yearSelect.replaceChildren(...results.map((row) => {
          const option = document.createElement('option');
          option.value = String(row.Anno);
          option.textContent = `Anno ${row.Anno}`;
          return option;
        }));
        yearSelect.dataset.options = optionSignature;
      }
      yearSelect.value = String(safeYear);

      const row = results.find((item) => item.Anno === safeYear) || results[0];
      const previousRow = results.find((item) => item.Anno === safeYear - 1);
      const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      };
      const money = (value) => this.formatMoney(Math.round(value || 0));
      const moneyExact = (value) => {
        const cents = Math.round(Math.abs(value || 0) * 100);
        const intPart = this.formatMoney(Math.floor(cents / 100)).replace(' €', '');
        const decimals = String(cents % 100).padStart(2, '0');
        return `${value < 0 ? '-' : ''}${intPart},${decimals} €`;
      };
      const signedMoney = (value) => `${value >= 0 ? '+' : '-'}${money(Math.abs(value || 0))}`;
      const percent = (value) => `${(value || 0).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}%`;
      const applyVariation = (baseValue, year, type, frequency, value) => {
        const safeBase = Math.max(baseValue || 0, 0);
        const safeFrequency = Math.max(parseInt(frequency, 10) || 0, 0);
        const safeValue = Number(value) || 0;
        if (safeFrequency <= 0 || safeValue === 0 || year <= 1) return safeBase;
        const increments = Math.floor((year - 1) / safeFrequency);
        if (increments <= 0) return safeBase;
        if (type === 'euro') return Math.max(safeBase + safeValue * increments, 0);
        return Math.max(safeBase * Math.pow(1 + safeValue / 100, increments), 0);
      };

      const redditoAnno = applyVariation(
        config.reddito,
        row.Anno,
        config.variazioneRedditoTipo,
        config.variazioneRedditoFrequenza,
        config.variazioneRedditoValore
      );
      const investimentoAnno = applyVariation(
        config.investimento,
        row.Anno,
        config.variazioneInvestimentoTipo,
        config.variazioneInvestimentoFrequenza,
        config.variazioneInvestimentoValore
      );
      const premiAnno = applyVariation(
        config.premiStraordinari,
        row.Anno,
        config.variazionePremiTipo,
        config.variazionePremiFrequenza,
        config.variazionePremiValore
      );
      const altriRedditiAnno = applyVariation(
        config.altriRedditi,
        row.Anno,
        config.variazioneAltriRedditiTipo,
        config.variazioneAltriRedditiFrequenza,
        config.variazioneAltriRedditiValore
      );
      const quotaFp = row['FP Cons'] || 0;
      const quotaPac = row['PAC Cons'] || 0;
      const quotaBusta = row['FP Busta'] || 0;
      const quotaBonifico = row['FP Bonifico'] || 0;
      const datore = row.Datore || 0;
      const risparmio = row.Risparmio || 0;
      const dedotto = row['Entro Ded'] || quotaFp;
      const exitMix = row['Exit Mix'] || 0;
      const exitFp = row['Exit FP'] || 0;
      const exitPac = row['Exit PAC'] || 0;
      const deltaFp = exitMix - exitFp;
      const deltaPac = exitMix - exitPac;
      const fpBase = config.baseContributivaFpTipo === 'ral' || (config.baseContributivaFp || 0) <= 0
        ? redditoAnno
        : applyVariation(
          config.baseContributivaFp,
          row.Anno,
          config.variazioneBaseContributivaTipo,
          config.variazioneBaseContributivaFrequenza,
          config.variazioneBaseContributivaValore
        );
      const quotaMinimaStimata = fpBase * (config.quotaMinAderentePerc || 0);

      // Step 1 - Imponibile e IRPEF: ricostruzione presentazionale con gli stessi calculator del modello.
      const redditoFiscaleAnno = redditoAnno + premiAnno + altriRedditiAnno;
      const imponibileIrpef = calculateIrpefTaxableIncome({
        reddito: redditoFiscaleAnno,
        contributiInpsPerc: config.contributiInpsPerc,
        massimaleContributivoInps: config.massimaleContributivoInps,
        sogliaIvsAggiuntivo: config.sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc: config.aliquotaIvsAggiuntivaPerc
      });
      const contributiInps = Math.max(redditoFiscaleAnno - imponibileIrpef, 0);
      const irpefLorda = calculateIncomeTax(imponibileIrpef);
      const addizionali = imponibileIrpef * (config.addizionaliPerc || 0);
      const aliquotaMarginale = imponibileIrpef <= 28000 ? 23 : imponibileIrpef <= 50000 ? 35 : 43;

      // Step 2 - Capienza deduzione.
      const limiteAnno = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP;
      const limiteOrdinario = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP;
      const deduzioneUsata = quotaFp + datore;
      const capienzaResidua = Math.max(limiteAnno - deduzioneUsata, 0);

      // Step 5 - aliquota effettiva del risparmio sulla quota dedotta dall'aderente.
      const aliquotaEffettiva = quotaFp > 0 ? (risparmio / quotaFp) * 100 : 0;
      const impostaAnnoLorda = irpefLorda + addizionali;

      // Step 6 - dettaglio exit: versato cumulato e fiscalita di uscita.
      const rowsUpToYear = results.filter((item) => item.Anno <= safeYear);
      const versatoFp = rowsUpToYear.reduce((total, item) => total + (item['FP Cons'] || 0) + (item.Datore || 0), 0);
      const versatoPac = rowsUpToYear.reduce((total, item) => total + (item['PAC Cons'] || 0), 0);
      const anniPartecipazione = (config.anzianitaPregressaFp || 0) + row.Anno;
      const tassoUscitaFp = new FinancialModel()
        .calcolaTassazioneFp((config.anzianitaPregressaFp || 0) + row.Anno - 1, Boolean(config.riscattoAnticipato));
      const impostaUscitaFp = versatoFp * tassoUscitaFp;
      const pacTassatoInUscita = config.rendimentoPacMode === 'lordo';
      const aliquotaPacUscita = calculateEffectiveTaxRate(
        config.quotaAgevolataPacPerc || 0,
        FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_AGEVOLATA,
        FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_PAC_ORDINARIA
      ) * 100;

      setText('annual-exit-value', money(exitMix));
      setText('annual-choice-value', this.formatChoiceLabel(row.Scelta || '-'));
      setText('annual-fp-value', money(quotaFp));
      setText('annual-pac-value', money(quotaPac));
      setText('annual-income-value', money(redditoAnno));
      setText('annual-extra-income-value', money(premiAnno + altriRedditiAnno));
      setText('annual-budget-value', money(investimentoAnno));
      setText('annual-returns-value', `${percent((config.rendimentoNettoFpEffettivo || 0) * 100)} / ${percent((config.rendimentoNettoPacEffettivo || 0) * 100)}`);
      // Step 1 - Imponibile e IRPEF
      setText('annual-taxable-step-value', money(imponibileIrpef));
      setText('annual-taxable-formula', `${money(redditoAnno)} retribuzione + ${money(premiAnno + altriRedditiAnno)} accessori - ${money(contributiInps)} INPS = ${money(imponibileIrpef)} imponibile IRPEF.`);
      setText('annual-gross-income-value', money(redditoFiscaleAnno));
      setText('annual-inps-value', `-${money(contributiInps)}`);
      setText('annual-irpef-value', money(irpefLorda));
      setText('annual-addizionali-value', money(addizionali));
      setText('annual-marginal-rate-value', `${aliquotaMarginale}%`);

      // Step 2 - Capienza e limite deduzione
      setText('annual-limit-step-value', moneyExact(limiteAnno));
      setText('annual-limit-formula', `Limite anno = ${moneyExact(limiteOrdinario)} ordinario; dedotti ${money(deduzioneUsata)} (aderente + datore).`);
      setText('annual-limit-ordinary-value', moneyExact(limiteOrdinario));
      setText('annual-limit-extra-value', 'Non prevista');
      setText('annual-limit-used-value', `${money(deduzioneUsata)} / ${moneyExact(limiteAnno)}`);
      setText('annual-limit-headroom-value', money(capienzaResidua));

      setText('annual-fp-step-value', money(quotaFp));
      setText('annual-fp-formula', `${money(fpBase)} base quota aderente x ${percent((config.quotaMinAderentePerc || 0) * 100)} = ${money(quotaMinimaStimata)} quota minima; quota FP scelta = ${money(quotaFp)}.`);
      setText('annual-employer-value', money(datore));
      setText('annual-deducted-value', money(dedotto));
      setText('annual-payroll-step-value', money(quotaBusta + quotaBonifico));
      setText('annual-payroll-formula', `${money(quotaFp)} FP = ${money(quotaBusta)} in busta + ${money(quotaBonifico)} via bonifico.`);
      setText('annual-payroll-value', money(quotaBusta));
      setText('annual-transfer-value', money(quotaBonifico));
      setText('annual-tax-saving-value', money(risparmio));
      setText('annual-tax-formula', quotaFp > 0
        ? `${money(quotaFp)} dedotti x ${percent(aliquotaEffettiva)} aliquota effettiva = ${money(risparmio)} risparmio (IRPEF + addizionali + detrazioni).`
        : 'Nessuna quota FP dedotta quest\'anno: risparmio fiscale 0 €.');
      setText('annual-effective-rate-value', quotaFp > 0 ? percent(aliquotaEffettiva) : '-');
      setText('annual-tax-before-after-value', `${money(impostaAnnoLorda)} → ${money(impostaAnnoLorda - risparmio)}`);
      setText('annual-exit-step-value', money(exitMix));
      setText('annual-exit-formula', previousRow
        ? `Da ${money(previousRow['Exit Mix'] || 0)} a ${money(exitMix)}; delta vs FP ${signedMoney(deltaFp)}, delta vs PAC ${signedMoney(deltaPac)}.`
        : `Primo anno: exit ottimale ${money(exitMix)}; delta vs FP ${signedMoney(deltaFp)}, delta vs PAC ${signedMoney(deltaPac)}.`);
      setText('annual-exit-contrib-fp-value', money(versatoFp));
      setText('annual-exit-contrib-pac-value', money(versatoPac));
      setText('annual-exit-fp-tax-label', config.riscattoAnticipato
        ? 'Riscatto anticipato: aliquota fissa'
        : `15% → 9%: ${anniPartecipazione} anni di partecipazione`);
      setText('annual-exit-fp-tax-value', `${percent(tassoUscitaFp * 100)} ≈ -${money(impostaUscitaFp)}`);
      setText('annual-exit-pac-tax-value', pacTassatoInUscita
        ? `${percent(aliquotaPacUscita)} sul gain`
        : 'Già inclusa nel rendimento netto');
      setText('annual-exit-fp-value', money(exitFp));
      setText('annual-exit-pac-value', money(exitPac));
    }

    updateInputWarnings(warnings) {
      const container = document.getElementById('input-warnings');
      if (!container) return;

      container.replaceChildren();
      container.classList.toggle('is-visible', warnings.length > 0);

      warnings.forEach((warning) => {
        const item = document.createElement('div');
        item.className = 'input-warning';

        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.dataset.lucide = 'circle-alert';
        icon.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.textContent = warning;

        item.append(icon, text);
        container.appendChild(item);
      });
      if (window.renderSiteIcons) window.renderSiteIcons();
    }

    /**
     * Formatta i valori monetari con separatori delle migliaia e simbolo valuta
     * @param {number} number - Importo da formattare
     * @returns {string} Stringa formattata con valuta
     */
    formatMoney(number) {
      return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
    }

    /**
     * Aggiorna il grafico con i dati dei risultati
     * @param {Array} results - Risultati dei calcoli
     */
    updateChart(results) {
      if (!results.length) return;

      const ctx = document.getElementById('results-chart');
      if (!ctx) return;

      // Estrai i dati per il grafico
      const labels = results.map(r => `Anno ${r['Anno']}`);
      const exitFP = results.map(r => r['Exit FP'] || 0);
      const exitPAC = results.map(r => r['Exit PAC'] || 0);
      const exitMix = results.map(r => r['Exit Mix'] || 0);

      const styles = getComputedStyle(document.documentElement);
      const textColor = styles.getPropertyValue('--color-text-secondary').trim() || '#4b5563';
      const gridColor = styles.getPropertyValue('--color-border-soft').trim() || '#e2e7de';

      // Colori
      const colors = {
        fp: styles.getPropertyValue('--color-metric-fp').trim() || '#2563eb',
        pac: styles.getPropertyValue('--color-metric-pac').trim() || '#d97706',
        mix: styles.getPropertyValue('--color-metric-mix').trim() || '#0f766e'
      };

      // Distruggi il grafico esistente se presente
      if (this.chart) {
        this.chart.destroy();
      }

      // Crea il nuovo grafico: istogramma, tre barre per anno.
      this.chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'FP deducibile',
              data: exitFP,
              backgroundColor: colors.fp,
              maxBarThickness: 24
            },
            {
              label: 'Tutto PAC',
              data: exitPAC,
              backgroundColor: colors.pac,
              maxBarThickness: 24
            },
            {
              label: 'Allocazione ottimale',
              data: exitMix,
              backgroundColor: colors.mix,
              maxBarThickness: 24
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index'
          },
          layout: {
            padding: {
              top: 10
            }
          },
          datasets: {
            bar: {
              categoryPercentage: 0.72,
              barPercentage: 0.92
            }
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                usePointStyle: true,
                padding: 20,
                boxWidth: 8,
                boxHeight: 8,
                color: textColor
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return context.dataset.label + ': ' +
                    context.raw.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + ' €';
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                display: false
              },
              ticks: {
                color: textColor
              }
            },
            y: {
              beginAtZero: true,
              grid: {
                display: false,
                color: gridColor
              },
              ticks: {
                color: textColor,
                callback: function(value) {
                  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + ' €';
                }
              }
            }
          }
        }
      });
    }
  }
