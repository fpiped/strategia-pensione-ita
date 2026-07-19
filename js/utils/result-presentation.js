/**
 * Restituisce l'allocazione da mostrare all'utente.
 *
 * Il motore conserva i valori non arrotondati. Quando la ricerca a passi di
 * 1 euro lascia meno di 1 euro sul PAC, l'interfaccia presenta il risultato
 * come interamente FP e assegna alla quota FP il lordo arrotondato. In questo
 * modo le grandezze mostrate restano sempre riconciliabili:
 * quota FP + quota PAC = investimento lordo.
 */
export function getPresentedAllocation(row = {}) {
  const gross = Math.round(Math.max(
    row.investimentoLordo
      ?? row._allocation?.investimentoLordo
      ?? ((row.quotaFpConsigliata || 0) + (row.quotaPacConsigliata || 0)),
    0
  ));

  if (row._allocation?.pacResidualTechnical) {
    return {
      choice: gross > 0 ? 'FP' : 'NESSUNO',
      fp: gross,
      pac: 0,
      gross
    };
  }

  const fp = Math.min(Math.round(Math.max(row.quotaFpConsigliata || 0, 0)), gross);
  return {
    choice: row.scelta || (gross > 0 ? 'MIX' : 'NESSUNO'),
    fp,
    pac: Math.max(gross - fp, 0),
    gross
  };
}

function marginalRateForIncome(income, brackets = []) {
  const safeIncome = Math.max(income || 0, 0);
  return brackets.find((bracket) => safeIncome <= bracket.upTo)?.rate
    ?? brackets.at(-1)?.rate
    ?? 0;
}

function normalizeThresholds(thresholds = []) {
  return thresholds
    .filter((threshold) => Number.isFinite(threshold.value))
    .sort((a, b) => a.value - b.value);
}

function crossedThresholds(before, after, thresholds) {
  const low = Math.min(before, after);
  const high = Math.max(before, after);
  if (low === high) return [];
  return thresholds.filter(({ value }) => value >= low && value < high);
}

/**
 * Costruisce la mappa delle soglie mostrata nell'esploratore annuale.
 * Per IRPEF usa l'imponibile dopo tutta la deduzione. Per detrazioni e
 * agevolazioni personali usa invece il reddito ridotto dalla sola quota FP in busta,
 * coerentemente con il confronto fiscale del motore.
 */
export function buildFiscalThresholdInsights({ taxComparison = {}, rules = {} } = {}) {
  const before = taxComparison.before || {};
  const after = taxComparison.after || {};
  const irpefRules = rules.irpef || {};
  const employeeRules = irpefRules.employeeDeduction || {};
  const supplementaryRules = rules.supplementaryTreatment || {};
  const wedgeRules = rules.taxWedgeBonus || {};
  const beforeIncome = Math.max(before.taxableIncome || 0, 0);
  const afterTaxableIncome = Math.max(after.taxableIncome ?? beforeIncome, 0);
  const afterPersonalIncome = Math.max(after.employeeDeductionIncome ?? afterTaxableIncome, 0);
  const beforeWorkIncome = Math.max(before.taxWedgeWorkIncome ?? beforeIncome, 0);
  const afterWorkIncome = Math.max(after.taxWedgeWorkIncome ?? afterPersonalIncome, 0);
  const beforeWedgeIncome = Math.max(before.taxWedgeTotalIncome ?? beforeIncome, 0);
  const afterWedgeIncome = Math.max(after.taxWedgeTotalIncome ?? afterPersonalIncome, 0);

  const createInsight = ({
    id,
    title,
    basis,
    beforeIncome: insightBeforeIncome = beforeIncome,
    afterIncome,
    thresholds,
    beforeResult,
    afterResult,
    resultType = 'money',
    resultLabel
  }) => {
    const normalized = normalizeThresholds(thresholds);
    const crossed = crossedThresholds(insightBeforeIncome, afterIncome, normalized);
    const resultChanged = Math.abs((beforeResult || 0) - (afterResult || 0)) > 1e-7;
    return {
      id,
      title,
      basis,
      beforeIncome: insightBeforeIncome,
      afterIncome,
      thresholds: normalized,
      crossedThresholds: crossed,
      status: crossed.length ? 'crossed' : resultChanged ? 'changed' : 'stable',
      beforeResult: beforeResult || 0,
      afterResult: afterResult || 0,
      resultType,
      resultLabel
    };
  };

  const brackets = irpefRules.brackets || [];
  const bracketThresholds = brackets
    .map((bracket, index) => ({
      value: bracket.upTo,
      label: `aliquota ${(brackets[index + 1]?.rate || bracket.rate) * 100}%`
    }))
    .filter((threshold) => Number.isFinite(threshold.value));

  const insights = [
    createInsight({
      id: 'irpef',
      title: 'Aliquota marginale IRPEF',
      basis: 'Imponibile dopo la deduzione FP',
      afterIncome: afterTaxableIncome,
      thresholds: bracketThresholds,
      beforeResult: marginalRateForIncome(beforeIncome, irpefRules.brackets),
      afterResult: marginalRateForIncome(afterTaxableIncome, irpefRules.brackets),
      resultType: 'percent',
      resultLabel: 'Aliquota sull’ultimo euro'
    }),
    createInsight({
      id: 'employee-deduction',
      title: 'Detrazione da lavoro',
      basis: 'Reddito ridotto dalla quota FP in busta',
      afterIncome: afterPersonalIncome,
      thresholds: [
        { value: employeeRules.minimumIncomeLimit, label: 'fine minimo' },
        { value: employeeRules.extraFrom, label: 'inizio +65 €' },
        { value: employeeRules.middleIncomeLimit, label: 'cambio formula' },
        { value: employeeRules.extraTo, label: 'fine +65 €' },
        { value: employeeRules.maximumIncomeLimit, label: 'detrazione 0' }
      ],
      beforeResult: before.employeeDeduction,
      afterResult: after.employeeDeduction,
      resultLabel: 'Detrazione riconosciuta'
    }),
    createInsight({
      id: 'supplementary-treatment',
      title: 'Trattamento integrativo',
      basis: 'Fino a 15.000 €: capienza sulla sola IRPEF da lavoro; tra 15.000 € e 28.000 €: detrazioni ammesse superiori all’IRPEF lorda complessiva',
      afterIncome: afterPersonalIncome,
      thresholds: [
        { value: supplementaryRules.fullThreshold, label: 'fascia condizionata' },
        { value: supplementaryRules.maximumThreshold, label: 'fine accesso' }
      ],
      beforeResult: before.supplementaryTreatment,
      afterResult: after.supplementaryTreatment,
      resultLabel: 'Importo riconosciuto'
    }),
    createInsight({
      id: 'tax-wedge-rate',
      title: 'Cuneo: somma esente',
      basis: 'Imponibile da lavoro; rileva fino a 20.000 € complessivi',
      beforeIncome: beforeWorkIncome,
      afterIncome: afterWorkIncome,
      thresholds: (wedgeRules.thresholds || []).slice(0, 2).map((value, index) => ({
        value,
        label: ['poi 5,3%', 'poi 4,8%'][index]
      })),
      beforeResult: before.taxWedgeCashAmount,
      afterResult: after.taxWedgeCashAmount,
      resultLabel: 'Somma erogata, non soggetta a capienza'
    }),
    createInsight({
      id: 'tax-wedge-access',
      title: 'Cuneo: detrazione IRPEF',
      basis: 'Tra 20.000 € e 40.000 €; utilizzabile soltanto entro la capienza IRPEF',
      beforeIncome: beforeWedgeIncome,
      afterIncome: afterWedgeIncome,
      thresholds: (wedgeRules.thresholds || []).slice(2).map((value, index) => ({
        value,
        label: ['detrazione', 'décalage', 'fine bonus'][index]
      })),
      beforeResult: before.taxWedgeDeductionUsed,
      afterResult: after.taxWedgeDeductionUsed,
      resultLabel: 'Detrazione effettivamente utilizzata'
    }),
    createInsight({
      id: 'high-income-deductions',
      title: 'Riduzione detrazioni per redditi alti',
      basis: 'Reddito ridotto dalla quota FP in busta',
      afterIncome: afterPersonalIncome,
      thresholds: [{
        value: irpefRules.highIncomeAdjustment?.threshold,
        label: `fino a −${irpefRules.highIncomeAdjustment?.amount || 0} €`
      }],
      beforeResult: before.highIncomeDeductionsCut,
      afterResult: after.highIncomeDeductionsCut,
      resultLabel: 'Riduzione applicata'
    })
  ];

  insights.push({
    id: 'tax-capacity',
    title: 'Capienza delle detrazioni',
    basis: 'IRPEF netta dopo le detrazioni',
    beforeIncome,
    afterIncome: afterTaxableIncome,
    thresholds: [],
    crossedThresholds: [],
    status: before.netTax > 0 && after.netTax <= 0
      ? 'crossed'
      : Math.abs((before.netTax || 0) - (after.netTax || 0)) > 1e-7
        ? 'changed'
        : 'stable',
    beforeResult: before.netTax || 0,
    afterResult: after.netTax || 0,
    resultType: 'money',
    resultLabel: after.netTax <= 0 ? 'Imposta azzerata: capienza esaurita' : 'Imposta ancora capiente'
  });

  return insights;
}
