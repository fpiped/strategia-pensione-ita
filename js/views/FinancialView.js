import { renderSiteIcons } from '../icons.js';
import { getPresentedAllocation } from '../utils/result-presentation.js';

/**
 * FinancialView - Gestisce tutto il rendering dell'interfaccia
 */
export class FinancialView {
    constructor() {
        this.chart = null;
    }

    formatChoiceLabel(choice) {
      if (choice === 'MIX') return 'FP + PAC';
      if (choice === 'NESSUNO') return 'Nessun versamento';
      return choice;
    }

    isTechnicalPacResidual(row) {
      return Boolean(row?._allocation?.pacResidualTechnical);
    }

    /**
     * Aggiorna il dashboard delle metriche con i valori di exit finali
     * @param {Array} results - Risultati dei calcoli
     */
    updateMetricsDashboard(results, tir = {}) {
      if (!results.length) return;
      const formatTir = (value) => Number.isFinite(value)
        ? `${(value * 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
        : 'n.d.';
      const element = document.getElementById('metric-optimal-tir');
      if (element) element.textContent = formatTir(tir.optimal);
    }

    /**
     * Crea una tabella dei risultati e la renderizza
     * @param {Array} results - Risultati dei calcoli
     */
    createTable(results) {
      if (!results.length) return;

      const columns = [
        { key: 'anno', label: 'Anno' },
        { key: 'investimentoNetto', label: 'Investimento netto' },
        { key: 'investimentoLordo', label: 'Investimento lordo' },
        { key: 'scelta', label: 'Allocazione' },
        { key: 'quotaFpConsigliata', label: 'Quota FP' },
        { key: 'quotaFpNonDeducibile', label: 'FP non deducibile' },
        { key: 'quotaPacConsigliata', label: 'Quota PAC' },
        { key: 'liquiditaResidua', label: 'Liquidità' },
        { key: 'quotaDatore', label: 'Datore' },
        { key: 'risparmioFiscale', label: 'Beneficio fiscale' },
        { key: 'exitOttimale', label: 'Exit netta' }
      ];

      const rows = results.map(result => {
        const allocation = getPresentedAllocation(result);
        const row = {};
        columns.forEach(({ key, label }) => {
          let value = result[key];
          if (key === 'scelta') {
            value = allocation.choice === 'NESSUNO' ? 'N/A' : this.formatChoiceLabel(allocation.choice);
          }
          if (key === 'quotaFpConsigliata') value = allocation.fp;
          if (key === 'quotaPacConsigliata') value = allocation.pac;
          if (key !== 'anno' && typeof value === 'number') {
            value = this.formatMoney(value);
          }
          row[label] = value;
        });
        return row;
      });

      const table = document.createElement('table');
      table.id = 'output-table';
      table.className = 'table-optimal';

      // Crea l'header della tabella
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (const key in rows[0]) {
        const headerCell = document.createElement('th');
        headerCell.scope = 'col';
        headerCell.textContent = key;
        headerRow.appendChild(headerCell);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Crea il body della tabella
      const tbody = document.createElement('tbody');
      rows.forEach((row, index) => {
        const newRow = document.createElement('tr');
        // Le righe mappate sono indicizzate per etichetta: l'anno arriva
        // dalla riga sorgente.
        newRow.dataset.anno = results[index].anno;
        for (const key in row) {
          const cell = document.createElement('td');
          if (key === 'Anno') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'table-year-button';
            button.textContent = row[key];
            button.setAttribute(
              'aria-label',
              `Esplora i calcoli dell’anno ${results[index].anno}`
            );
            cell.appendChild(button);
          } else {
            cell.textContent = row[key];
          }
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
        const selected = Number(row.dataset.anno) === year;
        row.classList.toggle('active', selected);
        const button = row.querySelector('.table-year-button');
        if (selected) {
          button?.setAttribute('aria-current', 'true');
        } else {
          button?.removeAttribute('aria-current');
        }
      });
    }

    updateChoiceSequence(results) {
      const element = document.getElementById('metric-sequence-value');
      const subtitle = document.getElementById('metric-sequence-subtitle');
      if (!element || !results.length) return;

      const intervals = [];
      let current = {
        start: results[0].anno,
        end: results[0].anno,
        choice: results[0].scelta
      };

      for (let i = 1; i < results.length; i++) {
        const row = results[i];
        if (row.scelta === current.choice) {
          current.end = row.anno;
        } else {
          intervals.push(current);
          current = { start: row.anno, end: row.anno, choice: row.scelta };
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

      this.renderChoiceTimeline(intervals, results.length);
    }

    /**
     * Timeline dell'allocazione: una barra segmentata, un segmento per
     * intervallo di scelta, larghezza proporzionale agli anni coperti.
     * È la traduzione grafica di "1-23: Split · 24-30: FP"; il testo
     * accanto resta come versione leggibile/accessibile.
     */
    renderChoiceTimeline(intervals, totalYears) {
      const timeline = document.getElementById('decision-timeline');
      if (!timeline) return;
      timeline.replaceChildren();
      if (!totalYears) return;

      intervals.forEach((interval) => {
        const years = interval.end - interval.start + 1;
        const segment = document.createElement('span');
        segment.className = 'decision-timeline-seg';
        segment.dataset.choice = String(interval.choice || '').toLowerCase();
        segment.style.flexGrow = String(years);
        segment.title = `${this.formatChoiceLabel(interval.choice)} — anni ${interval.start}-${interval.end}`;
        // L'etichetta compare solo se il segmento è largo abbastanza
        // (overflow nascosto via CSS): i micro-intervalli restano leggibili
        // dal testo accanto e dal title.
        const label = document.createElement('span');
        label.className = 'decision-timeline-label';
        label.textContent = years > 1
          ? `${this.formatChoiceLabel(interval.choice)} ${interval.start}-${interval.end}`
          : String(interval.start);
        segment.appendChild(label);
        timeline.appendChild(segment);
      });
    }

    /**
     * Count-up rapido del numerone del verdetto al ricalcolo: comunica
     * "sto ricalcolando" senza rallentare. Primo render, valore invariato
     * e prefers-reduced-motion vanno diretti al valore finale.
     */
    animateBestValue(element, target) {
      if (this.bestValueFrame) cancelAnimationFrame(this.bestValueFrame);
      const previous = this.lastBestValue;
      this.lastBestValue = target;

      const reduceMotion = window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (previous == null || previous === target || reduceMotion) {
        element.textContent = this.formatMoney(target);
        return;
      }

      const DURATION = 300;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / DURATION, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = this.formatMoney(Math.round(previous + (target - previous) * eased));
        if (progress < 1) this.bestValueFrame = requestAnimationFrame(step);
      };
      this.bestValueFrame = requestAnimationFrame(step);
    }

    updateResultExplanation(results) {
      const summary = document.getElementById('result-explanation-summary');
      const primaryGrid = document.getElementById('result-primary-grid');
      const secondaryGrid = document.getElementById('result-secondary-grid');
      const bestValue = document.getElementById('result-best-value');
      const bestDelta = document.getElementById('result-best-delta');
      if (!summary || !primaryGrid || !secondaryGrid || !results.length) return;

      const sum = (key) => results.reduce((total, row) => total + (row[key] || 0), 0);
      const allocations = results.map(getPresentedAllocation);
      const formatPercent = (value) => `${value.toLocaleString('it-IT', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}%`;

      const lastResult = results[results.length - 1];
      const optimalExit = lastResult.exitOttimale || 0;
      const firstRow = results[0];
      const lastChoice = lastResult.scelta || 'MIX';

      const totals = {
        fp: allocations.reduce((total, allocation) => total + allocation.fp, 0),
        pac: allocations.reduce((total, allocation) => total + allocation.pac, 0),
        datore: sum('quotaDatore'),
        risparmio: sum('risparmioFiscale'),
        differenzaBustaBonifico: sum('diffBustaBonifico'),
        fpBusta: sum('quotaFpBusta'),
        fpBonifico: sum('quotaFpBonifico'),
        deducibile: sum('quotaEntroDeduzione'),
        netto: sum('investimentoNetto'),
        lordo: sum('investimentoLordo')
      };
      const totalInvested = totals.fp + totals.pac;
      const fpShare = totalInvested > 0 ? (totals.fp / totalInvested) * 100 : 0;
      const pacShare = totalInvested > 0 ? (totals.pac / totalInvested) * 100 : 0;
      const usedEmployerYears = results.filter(row => (row.quotaDatore || 0) > 0).length;

      const yearsByChoice = results.reduce((acc, row) => {
        const choice = row.scelta || 'MIX';
        acc[choice] = (acc[choice] || 0) + 1;
        return acc;
      }, {});

      const choiceSummary = ['FP', 'PAC', 'MIX']
        .filter(choice => yearsByChoice[choice])
        .map(choice => `${yearsByChoice[choice]} anni ${this.formatChoiceLabel(choice)}`)
        .join(' · ');

      const firstSplitDetail = firstRow
        ? (() => {
          const allocation = getPresentedAllocation(firstRow);
          return allocation.choice === 'FP'
            ? 'Anno 1: tutto nel FP'
            : `Anno 1: ${this.formatMoney(allocation.fp)} FP e ${this.formatMoney(allocation.pac)} PAC`;
        })()
        : 'Nessuna quota allocata';
      const timingDetail = lastChoice === 'FP'
        ? 'Negli ultimi anni l’allocazione privilegia il FP.'
        : lastChoice === 'PAC'
          ? 'Negli ultimi anni l’allocazione privilegia il PAC.'
          : lastChoice === 'NESSUNO'
            ? 'Dopo l’anno 1 il capitale cresce senza nuovi versamenti.'
            : 'Negli ultimi anni resta conveniente una ripartizione tra FP e PAC.';

      summary.textContent = `Con l’investimento netto indicato, il piano ottimizzato chiude a ${this.formatMoney(Math.round(optimalExit))}. ${timingDetail}`;

      if (bestValue) this.animateBestValue(bestValue, Math.round(optimalExit));
      if (bestDelta) {
        bestDelta.textContent = firstRow
          ? `Anno 1: ${this.formatMoney(firstRow.investimentoNetto || 0)} netti finanziano ${this.formatMoney(firstRow.investimentoLordo || 0)} di versamenti personali.`
          : '';
      }

      const primaryCards = [
        {
          icon: 'wallet-cards',
          label: 'Investimento netto complessivo',
          value: this.formatMoney(Math.round(totals.netto)),
          detail: 'Somma degli investimenti netti annuali usati come vincolo dell’ottimizzazione.'
        },
        {
          icon: 'pie-chart',
          label: 'Dove vanno i versamenti',
          value: `${formatPercent(fpShare)} FP · ${formatPercent(pacShare)} PAC`,
          detail: firstSplitDetail
        },
        {
          icon: 'hand-coins',
          label: 'Capitale aggiuntivo',
          value: this.formatMoney(Math.round(totals.risparmio + totals.datore)),
          detail: `${this.formatMoney(Math.round(totals.risparmio))} di beneficio reinvestito + ${this.formatMoney(Math.round(totals.datore))} del datore.`
        },
        {
          icon: 'trending-up',
          label: 'Investimento lordo personale',
          value: this.formatMoney(Math.round(totals.lordo)),
          detail: 'Quota FP personale + quota PAC, incluso il beneficio fiscale reinvestito.'
        }
      ];

      const secondaryCards = [
        {
          icon: 'filter',
          label: 'Limite deducibile',
          value: this.formatMoney(Math.round(totals.deducibile)),
          detail: 'Quota personale trattata nel perimetro deducibile del piano ottimizzato.'
        },
        {
          icon: 'calendar-check',
          label: 'Scelte annuali',
          value: choiceSummary || 'Nessuna scelta',
          detail: `${timingDetail} Contributo datore ottenuto per ${usedEmployerYears}/${results.length} anni.`
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
      renderSiteIcons();
    }

    updateStrategyComparison(strategies = [], selectedStrategyId = 'optimized') {
      const container = document.getElementById('strategy-comparison-grid');
      if (!container) return;
      container.replaceChildren();
      if (!strategies.length) return;

      const allPacExit = strategies.find((strategy) => strategy.id === 'all-pac')?.exit || 0;
      const formatTir = (value) => Number.isFinite(value)
        ? `${(value * 100).toLocaleString('it-IT', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}%`
        : 'n.d.';

      strategies.forEach((strategy) => {
        const card = document.createElement('article');
        card.className = 'strategy-card';
        card.dataset.strategy = strategy.id;
        card.tabIndex = strategy.id === selectedStrategyId ? 0 : -1;
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', String(strategy.id === selectedStrategyId));
        card.setAttribute('aria-label', `Mostra il dettaglio della strategia ${strategy.label}`);
        card.classList.toggle('selected', strategy.id === selectedStrategyId);
        if (strategy.id === 'optimized') card.classList.add('recommended');
        const selectStrategy = () => {
          container.dispatchEvent(new CustomEvent('strategyselect', {
            bubbles: true,
            detail: { strategyId: strategy.id }
          }));
        };
        card.addEventListener('click', selectStrategy);
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectStrategy();
            return;
          }
          const cards = [...container.querySelectorAll('.strategy-card')];
          const current = cards.indexOf(card);
          let next = null;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            next = cards[(current + 1) % cards.length];
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            next = cards[(current - 1 + cards.length) % cards.length];
          } else if (event.key === 'Home') {
            next = cards[0];
          } else if (event.key === 'End') {
            next = cards.at(-1);
          }
          if (!next) return;
          event.preventDefault();
          next.focus();
          next.click();
        });

        const header = document.createElement('div');
        header.className = 'strategy-card-header';
        const heading = document.createElement('h4');
        heading.textContent = strategy.label;
        const badge = document.createElement('span');
        badge.className = 'strategy-badge';
        badge.textContent = strategy.id === 'optimized'
          ? 'Calcolata'
          : strategy.feasible
            ? 'Benchmark'
            : 'Minimo non sostenibile';
        header.append(heading, badge);

        const description = document.createElement('p');
        description.className = 'strategy-description';
        description.textContent = strategy.description;

        const exit = document.createElement('strong');
        exit.className = 'strategy-exit';
        exit.textContent = this.formatMoney(Math.round(strategy.exit));
        const exitLabel = document.createElement('span');
        exitLabel.className = 'strategy-exit-label';
        exitLabel.textContent = 'Valore netto finale';

        const delta = strategy.exit - allPacExit;
        const deltaText = document.createElement('p');
        deltaText.className = 'strategy-delta';
        deltaText.textContent = strategy.id === 'all-pac'
          ? 'Base di confronto'
          : `${delta >= 0 ? '+' : '−'}${this.formatMoney(Math.abs(Math.round(delta)))} rispetto a tutto PAC`;

        const metrics = document.createElement('dl');
        metrics.className = 'strategy-metrics';
        const items = [
          ['TIR', formatTir(strategy.tir)],
          ['FP personale', this.formatMoney(Math.round(strategy.totals.fpPersonale))],
          ['PAC', this.formatMoney(Math.round(strategy.totals.pac))],
          ['Datore', this.formatMoney(Math.round(strategy.totals.datore))],
          ['Beneficio fiscale', this.formatMoney(Math.round(strategy.totals.beneficioFiscale))],
          ['Liquidità residua', this.formatMoney(Math.round(strategy.totals.liquidita))]
        ];
        items.forEach(([label, value]) => {
          const wrapper = document.createElement('div');
          const term = document.createElement('dt');
          term.textContent = label;
          const detail = document.createElement('dd');
          detail.textContent = value;
          wrapper.append(term, detail);
          metrics.append(wrapper);
        });

        card.append(header, description, exitLabel, exit, deltaText, metrics);
        container.append(card);
      });
    }

    setSelectedStrategy(strategyId) {
      document.querySelectorAll('#strategy-comparison-grid .strategy-card').forEach((card) => {
        const selected = card.dataset.strategy === strategyId;
        card.classList.toggle('selected', selected);
        card.setAttribute('aria-checked', String(selected));
        card.tabIndex = selected ? 0 : -1;
      });
    }

    updateSelectedStrategyContext(strategy) {
      if (!strategy) return;
      const tableTitle = document.getElementById('toggle-results');
      const explorerTitle = document.getElementById('annual-explorer-title');
      if (tableTitle) tableTitle.textContent = `Dettaglio annuale · ${strategy.label}`;
      if (explorerTitle) explorerTitle.textContent = `Calcoli esplorabili · ${strategy.label}`;
    }

    updateAllocationFrontier(data) {
      if (!data) return;
      const range = document.getElementById('allocation-frontier-range');
      const minus = document.getElementById('allocation-frontier-minus');
      const plus = document.getElementById('allocation-frontier-plus');
      const value = document.getElementById('allocation-frontier-fp-value');
      const year = document.getElementById('allocation-frontier-year');
      const points = document.getElementById('allocation-critical-points');
      const metrics = document.getElementById('allocation-frontier-metrics');
      const status = document.getElementById('allocation-frontier-status');
      if (!range || !minus || !plus || !value || !year || !points || !metrics || !status) return;

      range.min = String(data.minQuotaFp);
      range.max = String(Math.max(data.maxQuotaFp, 0));
      range.value = String(Math.min(data.selected.quotaFp, data.maxQuotaFp));
      minus.disabled = data.selected.quotaFp <= data.minQuotaFp;
      plus.disabled = data.selected.quotaFp >= data.maxQuotaFp;
      value.textContent = this.formatMoney(Math.round(data.selected.quotaFp));
      year.textContent = `Anno ${data.anno}`;

      points.replaceChildren();
      data.criticalPoints.forEach((point) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'allocation-critical-button';
        button.disabled = !point.feasible;
        button.dataset.point = point.id;
        button.textContent = `${point.label} · ${this.formatMoney(Math.round(point.quotaFp))}`;
        button.addEventListener('click', () => {
          range.value = String(point.quotaFp);
          range.dispatchEvent(new Event('change', { bubbles: true }));
        });
        points.append(button);
      });

      metrics.replaceChildren();
      const selectedMetrics = [
        ['PAC derivato', data.selected.feasible ? this.formatMoney(Math.round(data.selected.quotaPac)) : 'non sostenibile'],
        ['Beneficio fiscale', data.selected.feasible ? this.formatMoney(Math.round(data.selected.beneficioFiscale)) : '-'],
        ['Contributo datore', data.selected.feasible ? this.formatMoney(Math.round(data.selected.quotaDatore)) : '-'],
        ['Valore finale proiettato', data.selected.feasible ? this.formatMoney(Math.round(data.selected.projectedExit)) : '-']
      ];
      selectedMetrics.forEach(([label, metricValue]) => {
        const item = document.createElement('div');
        const span = document.createElement('span');
        span.textContent = label;
        const strong = document.createElement('strong');
        strong.textContent = metricValue;
        item.append(span, strong);
        metrics.append(item);
      });

      status.textContent = data.selected.feasible
        ? `Quota sostenibile con il budget dell’anno. Orizzonte residuo: ${data.anniResidui} ${data.anniResidui === 1 ? 'anno' : 'anni'}.`
        : 'Questa quota non è sostenibile: dopo il salto fiscale il suo costo netto supera il budget.';
      status.classList.toggle('warning', !data.selected.feasible);
    }

    renderFiscalThresholdInsights(insights = []) {
      const grid = document.getElementById('annual-tax-thresholds');
      if (!grid) return;

      const money = (value) => this.formatMoney(Math.round(value || 0));
      const formatResult = (insight, value) => insight.resultType === 'percent'
        ? `${((value || 0) * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
        : money(value);
      const cards = insights.map((insight) => {
        const card = document.createElement('article');
        card.className = `fiscal-threshold-card is-${insight.status}`;
        card.dataset.thresholdId = insight.id;

        const header = document.createElement('div');
        header.className = 'fiscal-threshold-card-head';
        const headerCopy = document.createElement('div');
        const title = document.createElement('h5');
        title.textContent = insight.title;
        const basis = document.createElement('p');
        basis.textContent = insight.basis;
        headerCopy.append(title, basis);

        header.appendChild(headerCopy);
        if (insight.status === 'crossed') {
          const badge = document.createElement('span');
          badge.className = 'fiscal-threshold-badge';
          badge.textContent = insight.id === 'tax-capacity'
            ? 'Imposta azzerata'
            : 'Soglia attraversata';
          header.appendChild(badge);
        }

        const comparison = document.createElement('div');
        comparison.className = 'fiscal-threshold-comparison';
        const income = document.createElement('div');
        const incomeLabel = document.createElement('span');
        incomeLabel.textContent = 'Reddito di riferimento';
        const incomeValue = document.createElement('strong');
        incomeValue.textContent = `${money(insight.beforeIncome)} → ${money(insight.afterIncome)}`;
        income.append(incomeLabel, incomeValue);

        const result = document.createElement('div');
        const resultLabel = document.createElement('span');
        resultLabel.textContent = insight.resultLabel;
        const resultValue = document.createElement('strong');
        resultValue.textContent = `${formatResult(insight, insight.beforeResult)} → ${formatResult(insight, insight.afterResult)}`;
        result.append(resultLabel, resultValue);
        comparison.append(income, result);
        card.append(header, comparison);

        if (insight.thresholds.length) {
          const crossedValues = new Set(insight.crossedThresholds.map(({ value }) => value));
          const nearest = insight.thresholds.reduce((best, threshold) => {
            const distance = Math.min(
              Math.abs(threshold.value - insight.beforeIncome),
              Math.abs(threshold.value - insight.afterIncome)
            );
            return !best || distance < best.distance ? { value: threshold.value, distance } : best;
          }, null);
          const list = document.createElement('ul');
          list.className = 'fiscal-threshold-list';
          insight.thresholds.forEach((threshold) => {
            const item = document.createElement('li');
            if (crossedValues.has(threshold.value)) item.classList.add('is-crossed');
            else if (threshold.value === nearest?.value) item.classList.add('is-nearest');
            const amount = document.createElement('strong');
            amount.textContent = money(threshold.value);
            const label = document.createElement('span');
            label.textContent = threshold.label;
            item.append(amount, label);
            list.appendChild(item);
          });
          card.appendChild(list);
        }

        return card;
      });

      grid.replaceChildren(...cards);
    }

    updateAnnualExplorer(
      results,
      config,
      selectedYear = 1,
      explorer = null,
      strategy = null
    ) {
      const yearSelect = document.getElementById('annual-explorer-year');
      if (!yearSelect || !results.length || !config) return;

      const maxYear = results.at(-1).anno || results.length;
      const safeYear = Math.min(Math.max(selectedYear || 1, 1), maxYear);
      const optionSignature = results.map((row) => row.anno).join(',');
      if (yearSelect.dataset.options !== optionSignature) {
        yearSelect.replaceChildren(...results.map((row) => {
          const option = document.createElement('option');
          option.value = String(row.anno);
          option.textContent = `Anno ${row.anno}`;
          return option;
        }));
        yearSelect.dataset.options = optionSignature;
      }
      yearSelect.value = String(safeYear);

      const row = results.find((item) => item.anno === safeYear) || results[0];
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
      const e = explorer || {};
      const beforeTax = e.taxComparison?.before || {};
      const afterTax = e.taxComparison?.after || {};
      const exactAllocation = row._allocation || {};
      const presentedAllocation = getPresentedAllocation(row);
      const quotaFp = exactAllocation.quotaFp ?? row.quotaFpConsigliata ?? 0;
      const quotaPac = exactAllocation.quotaPac ?? row.quotaPacConsigliata ?? 0;
      const pacResidualTechnical = this.isTechnicalPacResidual(row);
      const quotaBusta = row.quotaFpBusta || 0;
      const quotaBonifico = row.quotaFpBonifico || 0;
      const datore = row.quotaDatore || 0;
      const risparmio = e.taxComparison?.saving ?? exactAllocation.beneficioFiscale ?? row.risparmioFiscale ?? 0;
      const exitOttimale = row.exitOttimale || 0;

      setText('annual-exit-value', money(exitOttimale));
      setText('annual-choice-value', this.formatChoiceLabel(presentedAllocation.choice || '-'));
      setText('annual-fp-value', money(presentedAllocation.fp));
      setText('annual-pac-value', money(presentedAllocation.pac));
      setText('annual-income-value', money(e.redditoAnno));
      setText('annual-extra-income-value', money(e.premiAnno + e.altriRedditiAnno));
      setText('annual-budget-value', money(e.investimentoAnno));
      const noNewPayment = row.scelta === 'NESSUNO';
      setText('annual-budget-label', noNewPayment ? 'Nuovo investimento netto' : 'Investimento netto indicato');
      setText('annual-budget-copy', noNewPayment
        ? 'Nessun nuovo versamento: continua a crescere il capitale dell’anno 1.'
        : 'Quanto vuoi che la strategia costi realmente nell’anno.');
      setText('annual-returns-value', `${percent((config.rendimentoNettoFpEffettivo || 0) * 100)} / ${percent((config.rendimentoNettoPacEffettivo || 0) * 100)}`);
      this.renderFiscalThresholdInsights(e.fiscalThresholds || []);
      // Step 1 - Imponibile e IRPEF
      setText('annual-taxable-step-value', money(e.imponibileIrpef));
      setText('annual-taxable-formula', `${money(e.redditoAnno)} retribuzione + ${money(e.premiAnno + e.altriRedditiAnno)} accessori - ${money(e.contributiInps)} INPS = ${money(e.imponibileIrpef)} imponibile IRPEF.`);
      setText('annual-gross-income-value', money(e.redditoFiscaleAnno));
      setText('annual-inps-value', `-${money(e.contributiInps)}`);
      setText('annual-irpef-value', money(e.irpefLorda));
      setText('annual-work-irpef-value', money(e.irpefLordaLavoro));
      setText('annual-addizionali-value', money(e.addizionali));
      const localTaxComponents = beforeTax.localTaxComponents || [];
      setText('annual-addizionali-detail', Array.isArray(config.localTaxRules) && config.localTaxRules.length >= 2
        ? `${money(localTaxComponents[0])} regionale + ${money(localTaxComponents[1])} comunale su ${money(beforeTax.taxableIncome)}`
        : `Aliquota manuale sulla base di ${money(beforeTax.taxableIncome)}`);
      setText('annual-marginal-rate-value', `${e.aliquotaMarginale}%`);
      setText('annual-employee-deduction-value', `-${money(e.detrazioneLavoro)}`);
      setText('annual-ordinary-deductions-value', `-${money(e.detrazioniOrdinarie)}`);
      setText('annual-supplementary-deductions-value', `-${money(e.detrazioniTrattamentoIntegrativo)}`);
      setText('annual-net-tax-value', money(e.impostaNetta));
      setText('annual-supplementary-treatment-value', `+${money(e.trattamentoIntegrativo)}`);
      setText('annual-tax-wedge-bonus-value', e.sommaCuneo > 0
        ? `+${money(e.sommaCuneo)} somma`
        : e.detrazioneCuneoNominale > 0
          ? `-${money(e.detrazioneCuneoUsata)} detrazione`
          : money(0));
      setText('annual-bonuses-value', `+${money(e.trattamentoIntegrativo + e.bonusCuneo)}`);
      setText('annual-fiscal-cost-step-value', money(beforeTax.fiscalCost));
      const detrazioniNominali = Math.max(
        e.detrazioneLavoro + e.altreDetrazioniTotali - (e.riduzioneDetrazioniAltiRedditi || 0),
        0
      ) + (e.detrazioneCuneoNominale || 0);
      setText('annual-tax-components-formula', `max(${money(e.irpefLorda)} IRPEF - ${money(detrazioniNominali)} detrazioni, 0) = ${money(e.irpefNetta)} IRPEF netta; + ${money(e.addizionali)} addizionali = ${money(e.impostaNetta)} imposta netta; meno ${money(e.trattamentoIntegrativo + e.sommaCuneo)} somme erogate = ${money(beforeTax.fiscalCost)} costo fiscale.`);

      // Step 2 - Limite di deduzione: nessuna stima di capienza fiscale;
      // qui si mostra solo il limite normativo esatto e come viene occupato.
      setText('annual-limit-step-value', moneyExact(e.limiteAnno));
      setText('annual-limit-formula', `${moneyExact(e.limiteAnno)} limite - ${money(datore)} datore = ${money(e.limiteDisponibileAderente)} spazio personale ordinario. Dedotti: ${money(e.quotaFpDeducibile)} tuoi + ${money(e.quotaDatoreDeducibile)} datore = ${money(e.deduzioneUsata)}.`);
      setText('annual-limit-ordinary-value', moneyExact(e.limiteAnno));
      setText('annual-employer-limit-value', money(datore));
      setText('annual-available-limit-value', money(e.limiteDisponibileAderente));
      setText('annual-limit-used-value', `${money(e.deduzioneUsata)} / ${moneyExact(e.limiteAnno)}`);
      setText('annual-limit-headroom-value', money(e.capienzaResidua));
      setText('annual-over-limit-value', money(e.quotaPacOltreLimite));

      // Step 3 - Allocazione e motivazione leggibile.
      const yearsLeft = Math.max((config.durata || safeYear) - safeYear + 1, 1);
      const choice = presentedAllocation.choice || '-';
      const employerReason = datore > 0
        ? `${money(e.quotaMinimaStimata)} nel FP sbloccano ${money(datore)} del datore. `
        : '';
      const policyReasons = {
        'all-pac': 'La strategia selezionata destina per definizione l’intero budget investibile al PAC.',
        'minimum-employer': 'La strategia selezionata versa al FP soltanto il minimo sostenibile necessario al datore e assegna il residuo al PAC.',
        'maximum-fp': 'La strategia selezionata usa la massima quota FP sostenibile; l’eventuale residuo non investibile resta liquidità.'
      };
      const allocationReason = policyReasons[strategy?.id] || (choice === 'FP'
        ? `Il modello assegna al FP tutta la quota disponibile confrontandone il valore netto a scadenza con il PAC.`
        : choice === 'PAC'
          ? `Il modello assegna il budget al PAC perché produce il valore netto prospettico più alto con queste ipotesi.`
          : choice === 'NESSUNO'
            ? `Non viene aggiunto nuovo capitale: questo anno mostra soltanto l’evoluzione del versamento effettuato nell’anno 1.`
            : `Dopo la quota minima, il modello confronta FP e PAC euro per euro dove la fiscalità cambia e usa gli estremi esatti nei tratti lineari.`);
      setText('annual-fp-step-value', money(presentedAllocation.fp));
      const investimentoLordoEsatto = exactAllocation.investimentoLordo ?? e.investimentoPersonaleAnno ?? 0;
      const beneficioEsatto = exactAllocation.beneficioFiscale ?? e.beneficioInvestitoAnno ?? 0;
      const liquiditaAnnoEsatta = exactAllocation.liquiditaResidua ?? row.liquiditaResidua ?? 0;
      const capitaleDisponibileEsatto = investimentoLordoEsatto + liquiditaAnnoEsatta;
      const investimentoNettoEsatto = capitaleDisponibileEsatto - beneficioEsatto;
      const allocationFormula = pacResidualTechnical
        ? `${money(presentedAllocation.fp)} FP mostrati`
        : `${moneyExact(quotaFp)} FP + ${moneyExact(quotaPac)} PAC`
          + (liquiditaAnnoEsatta > 0 ? ` + ${moneyExact(liquiditaAnnoEsatta)} liquidità` : '');
      setText('annual-fp-formula', `${moneyExact(investimentoNettoEsatto)} budget netto + ${moneyExact(beneficioEsatto)} beneficio = ${moneyExact(capitaleDisponibileEsatto)} disponibile = ${allocationFormula}. ${employerReason}${allocationReason} Orizzonte: ${yearsLeft} anni; rendimenti netti FP/PAC: ${percent((config.rendimentoNettoFpEffettivo || 0) * 100)} / ${percent((config.rendimentoNettoPacEffettivo || 0) * 100)}.`);
      setText('annual-within-min-value', money(e.quotaEntroMinima));
      setText('annual-above-min-value', money(e.quotaExtraMinima));
      setText('annual-effective-expense-value', money(e.spesaEffettivaAnno));
      setText('annual-personal-investment-value', money(e.investimentoPersonaleAnno));
      setText('annual-tax-funded-value', `+${money(e.beneficioInvestitoAnno)}`);
      setText('annual-employer-value', money(datore));
      setText('annual-total-at-work-value', money(e.totaleMessoAlLavoroAnno));
      setText('annual-personal-deductible-value', money(e.quotaFpDeducibile));
      setText('annual-personal-nondeductible-value', money(e.quotaFpNonDeducibile));
      setText('annual-deducted-value', money(e.deduzioneUsata));
      setText('annual-years-left-value', `${yearsLeft} ${yearsLeft === 1 ? 'anno' : 'anni'}`);

      // Step 4 - Busta e bonifico con i due benefici confrontati.
      setText('annual-payroll-step-value', money(quotaBusta + quotaBonifico));
      setText('annual-payroll-formula', `${money(quotaFp)} FP = ${money(quotaBusta)} in busta + ${money(quotaBonifico)} via bonifico.`);
      setText('annual-payroll-value', money(quotaBusta));
      setText('annual-transfer-value', money(quotaBonifico));
      setText('annual-baseline-saving-value', money(e.risparmioBaselineBusta));
      setText('annual-all-payroll-saving-value', money(e.risparmioTuttoBusta));
      setText('annual-split-diff-value', signedMoney(e.diffBustaBonifico));

      // Step 5 - Confronto fiscale esatto usato dal modello.
      setText('annual-tax-saving-value', money(risparmio));
      const beforeBonuses = (beforeTax.supplementaryTreatment || 0) + (beforeTax.taxWedgeBonus || 0);
      const afterBonuses = (afterTax.supplementaryTreatment || 0) + (afterTax.taxWedgeBonus || 0);
      setText('annual-tax-formula', quotaFp > 0
        ? `${moneyExact(beforeTax.fiscalCost)} costo fiscale senza FP - ${moneyExact(afterTax.fiscalCost)} con FP = ${moneyExact(risparmio)} beneficio effettivo.`
        : `Nessuna quota FP dedotta: il costo fiscale non cambia e il beneficio è 0 €.`);
      setText('annual-taxable-before-after-value', `${money(beforeTax.taxableIncome)} → ${money(afterTax.taxableIncome)}`);
      setText('annual-gross-tax-before-after-value', `${money((beforeTax.grossIncomeTax || 0) + (beforeTax.localTaxes || 0))} → ${money((afterTax.grossIncomeTax || 0) + (afterTax.localTaxes || 0))}`);
      setText('annual-deduction-before-after-value', `${money(beforeTax.employeeDeduction)} → ${money(afterTax.employeeDeduction)}`);
      setText('annual-supplementary-before-after-value', `${money(beforeTax.supplementaryTreatment)} → ${money(afterTax.supplementaryTreatment)}`);
      setText('annual-tax-wedge-before-after-value', `${money(beforeTax.taxWedgeBonus)} → ${money(afterTax.taxWedgeBonus)}`);
      setText('annual-bonus-before-after-value', `${money(beforeBonuses)} → ${money(afterBonuses)}`);
      setText('annual-fiscal-cost-before-after-value', `${money(beforeTax.fiscalCost)} → ${money(afterTax.fiscalCost)}`);
      setText('annual-effective-rate-value', quotaFp > 0 ? percent((risparmio / quotaFp) * 100) : '-');

      // Step 6 - Riconciliazione completa dell'exit.
      const exitEsatta = (e.montanteFp || 0) + (e.montantePac || 0)
        + (e.liquiditaAccumulata || 0)
        - (e.impostaUscitaFp || 0) - (e.impostaUscitaPac || 0);
      setText('annual-exit-step-value', money(exitOttimale));
      setText('annual-exit-formula', `${moneyExact(e.montanteFp)} FP + ${moneyExact(e.montantePac)} PAC + ${moneyExact(e.liquiditaAccumulata)} liquidità - ${moneyExact(e.impostaUscitaFp)} imposta FP - ${moneyExact(e.impostaUscitaPac)} imposta PAC = ${moneyExact(exitEsatta)} netto. Il beneficio fiscale ha già finanziato i versamenti dell'anno.`);
      setText('annual-montante-fp-value', `${money(e.montanteFp)} (${money(e.versatoFp)} versati)`);
      setText('annual-fp-deductible-total-value', money(e.versatoFpDeducibile));
      setText('annual-fp-nondeductible-total-value', money(e.versatoFpNonDeducibile));
      setText('annual-montante-pac-value', `${money(e.montantePac)} (${money(e.versatoPac)} versati)`);
      setText('annual-cash-value', money(e.liquiditaAccumulata));
      setText('annual-growth-value', `+${money((e.rendimentoFpAnno || 0) + (e.rendimentoPacAnno || 0))}`);
      setText('annual-fixed-costs-value', `-${money((e.costoFissoFpAnno || 0) + (e.costoFissoPacAnno || 0))} (FP ${money(e.costoFissoFpAnno || 0)} · PAC ${money(e.costoFissoPacAnno || 0)})`);
      setText('annual-exit-fp-tax-label', config.riscattoAnticipato
        ? 'Riscatto anticipato: aliquota fissa'
        : `15% → 9%: ${e.anniPartecipazione} anni di partecipazione`);
      setText('annual-exit-fp-tax-value', `${percent(e.tassoUscitaFp * 100)} ≈ -${money(e.impostaUscitaFp)}`);
      setText('annual-exit-pac-tax-value', e.pacTassatoInUscita
        ? `${percent(e.aliquotaPacUscita)} sul gain ≈ -${money(e.impostaUscitaPac)}`
        : `${money(0)} · già inclusa nel rendimento netto`);
      setText('annual-saving-in-exit-value', `${money(risparmio)} · già incluso`);
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
      renderSiteIcons();
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
     * Aggiorna il grafico con l'exit dell'allocazione ottimale e griglia
     * solo orizzontale.
     * @param {Array} results - Risultati dei calcoli
     */
    updateChart(results, strategies = []) {
      if (!results.length) return;

      const ctx = document.getElementById('results-chart');
      if (!ctx) return;

      const labels = results.map(r => `Anno ${r.anno}`);
      const styles = getComputedStyle(document.documentElement);
      const textColor = styles.getPropertyValue('--color-text-secondary').trim() || '#4b5563';
      const gridColor = styles.getPropertyValue('--color-border-soft').trim() || '#e2e7de';
      const fontSans = styles.getPropertyValue('--font-sans').trim() || 'Inter, sans-serif';
      const fontMono = styles.getPropertyValue('--font-mono').trim() || 'monospace';

      const strategyColors = ['#0E7C6B', '#4C78A8', '#D18B2C', '#8A5A9E'];
      const chartStrategies = strategies.length
        ? strategies
        : [{
          label: 'Allocazione ottimale',
          results
        }];
      const datasets = chartStrategies.map((strategy, index) => ({
        label: strategy.label,
        data: strategy.results.map((row) => row.exitOttimale || 0),
        backgroundColor: strategyColors[index % strategyColors.length],
        maxBarThickness: strategies.length > 1 ? 11 : 24
      }));
      const formatMoney = (value) => this.formatMoney(value);
      const withAlpha = (hex, alpha) => {
        const value = hex.replace('#', '');
        const n = parseInt(value.length === 3 ? value.replace(/./g, '$&$&') : value, 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
      };

      // Distruggi il grafico esistente se presente
      if (this.chart) {
        this.chart.destroy();
      }

      this.chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets
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
              top: 6
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
              align: 'center',
              labels: {
                usePointStyle: true,
                pointStyle: 'rectRounded',
                padding: 18,
                boxWidth: 10,
                boxHeight: 10,
                color: textColor,
                font: { family: fontSans, size: 12, weight: 600 }
              }
            },
            tooltip: {
              backgroundColor: '#16211B',
              borderColor: '#3B473F',
              borderWidth: 1,
              padding: 10,
              titleFont: { family: fontSans, size: 12, weight: 600 },
              bodyFont: { family: fontMono, size: 12 },
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              callbacks: {
                label(context) {
                  return ` ${context.dataset.label}: ${formatMoney(Math.round(context.raw))}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                display: false
              },
              border: {
                color: gridColor
              },
              ticks: {
                color: textColor,
                font: { family: fontMono, size: 10 },
                maxRotation: 0,
                autoSkip: false,
                // Un'etichetta ogni 5 anni (più il primo): il dettaglio
                // anno per anno lo danno tooltip e tabella.
                callback(value, index) {
                  const anno = results[index]?.anno;
                  if (anno === 1 || anno % 5 === 0) return `Anno ${anno}`;
                  return '';
                }
              }
            },
            y: {
              beginAtZero: true,
              grid: {
                display: true,
                color: withAlpha(gridColor.startsWith('#') ? gridColor : '#DDDBD1', 0.55),
                drawTicks: false
              },
              border: {
                display: false
              },
              ticks: {
                color: textColor,
                font: { family: fontMono, size: 10 },
                maxTicksLimit: 6,
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
