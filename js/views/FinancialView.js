/**
 * FinancialView - Gestisce tutto il rendering dell'interfaccia
 */
export class FinancialView {
    constructor() {
        this.chart = null;
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
      const exitMix = lastResult['Exit Mix'] || 0;

      // Aggiorna le card delle metriche
      document.getElementById('metric-fp-value').textContent = this.formatMoney(exitFP);
      document.getElementById('metric-pac-value').textContent = this.formatMoney(exitPAC);
      document.getElementById('metric-mix-value').textContent = this.formatMoney(exitMix);

      // Trova lo scenario migliore
      const values = [
        { id: 'fp', value: exitFP, card: document.querySelector('.metric-card.metric-fp') },
        { id: 'pac', value: exitPAC, card: document.querySelector('.metric-card.metric-pac') },
        { id: 'mix', value: exitMix, card: document.querySelector('.metric-card.metric-mix') }
      ];

      // Rimuovi la classe 'best' da tutte le card
      values.forEach(v => {
        if (v.card) v.card.classList.remove('best');
      });

      // Trova e evidenzia la migliore
      const best = values.reduce((a, b) => a.value > b.value ? a : b);
      if (best.card) {
        best.card.classList.add('best');

        // Mostra il badge sulla card migliore
        document.querySelectorAll('.metric-badge').forEach(b => b.style.display = 'none');
        const bestBadge = best.card.querySelector('.metric-badge');
        if (bestBadge) {
          bestBadge.style.display = 'block';
        }
      }
    }

    /**
     * Crea una tabella dei risultati e la renderizza
     * @param {Array} results - Risultati dei calcoli
     * @param {string} tableView - Vista tabella: fp, pac, mix o comparison
     */
    createTable(results, tableView = 'mix') {
      if (!results.length) return;

      const columnsByView = {
        fp: [
          { key: 'Anno', label: 'Anno' },
          { key: 'Entro Ded', label: 'Quota FP' },
          { key: 'Extra Ded', label: 'Quota PAC extra' },
          { key: 'FP Busta', label: 'FP busta' },
          { key: 'FP Bonifico', label: 'FP bonifico' },
          { key: 'Ott Busta', label: 'Extra busta' },
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
          { key: 'Ott Busta', label: 'Extra busta' },
          { key: 'Datore', label: 'Datore' },
          { key: 'Risparmio', label: 'Risparmio fiscale' },
          { key: 'Exit Mix', label: 'Exit Mix' }
        ],
        comparison: [
          { key: 'Anno', label: 'Anno' },
          { key: 'Exit FP', label: 'FP deducibile' },
          { key: 'Exit PAC', label: 'Tutto PAC' },
          { key: 'Exit Mix', label: 'Mix' }
        ]
      };
      const columns = columnsByView[tableView] || columnsByView.mix;

      const rows = results.map(result => {
        const row = {};
        columns.forEach(({ key, label }) => {
          let value = result[key];
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
          return `${range}: ${interval.choice}`;
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
      const grid = document.getElementById('result-explanation-grid');
      if (!summary || !grid || !results.length) return;

      const sum = (key) => results.reduce((total, row) => total + (row[key] || 0), 0);
      const formatSignedMoney = (value) => `${value >= 0 ? '+' : '-'}${this.formatMoney(Math.abs(Math.round(value)))}`;
      const formatPercent = (value) => `${value.toLocaleString('it-IT', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}%`;

      const lastResult = results[results.length - 1];
      const exits = [
        { key: 'FP', label: 'FP deducibile', value: lastResult['Exit FP'] || 0 },
        { key: 'PAC', label: 'Tutto PAC', value: lastResult['Exit PAC'] || 0 },
        { key: 'MIX', label: 'Mix', value: lastResult['Exit Mix'] || 0 }
      ].sort((a, b) => b.value - a.value);

      const best = exits[0];
      const runnerUp = exits[1];
      const delta = Math.max(0, best.value - runnerUp.value);
      const mixVsFp = (lastResult['Exit Mix'] || 0) - (lastResult['Exit FP'] || 0);
      const mixVsPac = (lastResult['Exit Mix'] || 0) - (lastResult['Exit PAC'] || 0);
      const firstRow = results[0];
      const lastChoice = lastResult.Scelta || 'MIX';

      const totals = {
        fp: sum('FP Cons'),
        pac: sum('PAC Cons'),
        datore: sum('Datore'),
        risparmio: sum('Risparmio'),
        ottimizzazioneBusta: sum('Ott Busta'),
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
        .map(choice => `${yearsByChoice[choice]} anni ${choice}`)
        .join(' · ');

      const firstSplitDetail = firstRow
        ? `Anno 1: ${this.formatMoney(firstRow['FP Cons'] || 0)} FP e ${this.formatMoney(firstRow['PAC Cons'] || 0)} PAC`
        : 'Nessuna quota allocata';
      const bustaDetail = totals.fp > 0
        ? `${this.formatMoney(Math.round(totals.fpBusta))} busta, ${this.formatMoney(Math.round(totals.fpBonifico))} bonifico`
        : 'Nessun versamento FP nel mix';
      const optimizationDetail = totals.ottimizzazioneBusta > 0
        ? `${this.formatMoney(Math.round(totals.ottimizzazioneBusta))} di beneficio fiscale aggiuntivo rispetto a quota minima in busta + extra via bonifico.`
        : totals.fpBonifico > 0
          ? 'L’extra via bonifico resta competitivo: portarlo in busta non aggiunge beneficio fiscale netto nello scenario impostato.'
          : 'Nessun beneficio extra da ripartizione: la quota FP in busta coincide con il minimo o con tutta la quota utile.';
      const mixDetail = best.key === 'MIX'
        ? `Rispetto a FP: ${formatSignedMoney(mixVsFp)} · rispetto a PAC: ${formatSignedMoney(mixVsPac)}`
        : `Il mix resta ${formatSignedMoney((lastResult['Exit Mix'] || 0) - best.value)} dal migliore`;
      const timingDetail = lastChoice === 'FP'
        ? 'Negli ultimi anni pesa di più il vantaggio fiscale immediato del FP.'
        : lastChoice === 'PAC'
          ? 'Anche verso fine periodo il rendimento PAC resta sufficiente nello scenario impostato.'
          : 'Lo split resta utile quando conviene prendere incentivi FP senza rinunciare del tutto al PAC.';

      summary.textContent = delta > 0
        ? `${best.label} chiude a ${this.formatMoney(Math.round(best.value))}, circa ${this.formatMoney(Math.round(delta))} sopra ${runnerUp.label}. ${timingDetail}`
        : `${best.label} e ${runnerUp.label} arrivano sostanzialmente alla pari nello scenario impostato.`;

      const cards = [
        {
          icon: best.key === 'MIX' ? 'fa-route' : 'fa-trophy',
          label: best.key === 'MIX' ? 'Mix vs alternative' : 'Scenario migliore',
          value: best.label,
          detail: mixDetail
        },
        {
          icon: 'fa-chart-pie',
          label: 'Dove vanno i versamenti',
          value: `${formatPercent(fpShare)} FP · ${formatPercent(pacShare)} PAC`,
          detail: `${firstSplitDetail}. Extra oltre deduzione nel PAC: ${this.formatMoney(Math.round(totals.extraPac))}`
        },
        {
          icon: 'fa-hand-holding-dollar',
          label: 'Incentivi agganciati al FP',
          value: this.formatMoney(Math.round(totals.datore + totals.risparmio)),
          detail: `${this.formatMoney(Math.round(totals.datore))} datore + ${this.formatMoney(Math.round(totals.risparmio))} beneficio fiscale. Datore preso per ${usedEmployerYears}/${results.length} anni`
        },
        {
          icon: 'fa-file-invoice-dollar',
          label: 'Ottimizzazione busta',
          value: totals.ottimizzazioneBusta > 0
            ? `+${this.formatMoney(Math.round(totals.ottimizzazioneBusta))}`
            : totals.fp > 0
              ? `${formatPercent(payrollShare)} FP in busta`
              : 'Nessun FP',
          detail: `${bustaDetail}. ${optimizationDetail}`
        },
        {
          icon: 'fa-filter',
          label: 'Limite deducibile',
          value: this.formatMoney(Math.round(totals.deducibile)),
          detail: 'Quota trattata dentro il perimetro deducibile; la parte fuori deduzione viene indirizzata al PAC.'
        },
        {
          icon: 'fa-calendar-check',
          label: 'Scelte annuali',
          value: choiceSummary || 'Nessuna scelta',
          detail: timingDetail
        }
      ];

      grid.replaceChildren(...cards.map(card => {
        const item = document.createElement('article');
        item.className = 'result-explanation-card';

        const icon = document.createElement('i');
        icon.className = `fas ${card.icon}`;

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
      }));
    }

    updateInputWarnings(warnings) {
      const container = document.getElementById('input-warnings');
      if (!container) return;

      container.replaceChildren();
      container.classList.toggle('is-visible', warnings.length > 0);

      warnings.forEach((warning) => {
        const item = document.createElement('div');
        item.className = 'input-warning';

        const icon = document.createElement('i');
        icon.className = 'fas fa-circle-exclamation';

        const text = document.createElement('span');
        text.textContent = warning;

        item.append(icon, text);
        container.appendChild(item);
      });
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

      // Colori
      const colors = {
        fp: '#3b82f6',    // blu
        pac: '#10b981',   // verde
        mix: '#f59e0b'    // arancione
      };

      // Distruggi il grafico esistente se presente
      if (this.chart) {
        this.chart.destroy();
      }

      // Crea il nuovo grafico
      this.chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Exit FP',
              data: exitFP,
              borderColor: colors.fp,
              backgroundColor: colors.fp + '20',
              tension: 0.3,
              fill: false
            },
            {
              label: 'Exit PAC',
              data: exitPAC,
              borderColor: colors.pac,
              backgroundColor: colors.pac + '20',
              tension: 0.3,
              fill: false
            },
            {
              label: 'Mix',
              data: exitMix,
              borderColor: colors.mix,
              backgroundColor: colors.mix + '20',
              tension: 0.3,
              fill: false
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
          plugins: {
            legend: {
              position: 'top',
              labels: {
                usePointStyle: true,
                padding: 20,
                boxWidth: 8,
                boxHeight: 8
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
            y: {
              beginAtZero: true,
              ticks: {
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
