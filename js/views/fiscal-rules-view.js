import { CURRENT_FISCAL_RULES, CURRENT_FISCAL_YEAR } from '../constants/fiscal-rules.js';

const money = (value) => `${value.toLocaleString('it-IT', { useGrouping: 'always' })} €`;
const percent = (value) => `${(value * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

function describeValue(id, rules) {
  const { irpef, pensionFund, inps, supplementaryTreatment, taxWedgeBonus, investmentTax } = rules;
  const descriptions = {
    irpef: () => {
      const brackets = irpef.brackets;
      return `${percent(brackets[0].rate)} fino a ${money(brackets[0].upTo)}, ` +
        `${percent(brackets[1].rate)} fino a ${money(brackets[1].upTo)}, ` +
        `${percent(brackets[2].rate)} oltre; sopra ${money(irpef.highIncomeAdjustment.threshold)} ` +
        `il beneficio del taglio (${money(irpef.highIncomeAdjustment.amount)}) è sterilizzato.`;
    },
    employeeDeduction: () => `${money(irpef.employeeDeduction.minimumAmount)}.`,
    pensionDeduction: () => `${money(pensionFund.deductionLimit)}/anno, datore incluso e TFR escluso.`,
    pensionExitTax: () => `${percent(pensionFund.exitTax.initialRate)}, ` +
      `-${percent(pensionFund.exitTax.reductionPerYear)}/anno oltre il ` +
      `${pensionFund.exitTax.reductionStartsAfterYears}°, minimo ${percent(pensionFund.exitTax.minimumRate)}.`,
    earlyRedemption: () => `${percent(pensionFund.exitTax.earlyRedemptionRate)} sui contributi dedotti.`,
    inpsRate: () => `${percent(inps.employeeRate)}, modificabile.`,
    inpsCeiling: () => `${money(inps.contributionCeiling)}.`,
    additionalIvs: () => `+${percent(inps.additionalIvsRate)} oltre ${money(inps.additionalIvsThreshold)}.`,
    supplementaryTreatment: () => `${money(supplementaryTreatment.amount)}/anno; pieno fino a ` +
      `${money(supplementaryTreatment.fullThreshold)}, a capienza fino a ${money(supplementaryTreatment.maximumThreshold)}.`,
    taxWedgeBonus: () => `somma integrativa fino a ${money(taxWedgeBonus.thresholds[2])}; ` +
      `detrazione ${money(taxWedgeBonus.fullDeduction)} tra ${money(taxWedgeBonus.thresholds[2])} ` +
      `e ${money(taxWedgeBonus.thresholds[4])}.`,
    pensionInvestmentTax: () => `${percent(investmentTax.pensionFundOrdinaryRate)} ordinaria, ` +
      `${percent(investmentTax.governmentBondsRate)} su quota titoli di Stato in modalità lorda.`,
    pacCapitalGain: () => `${percent(investmentTax.pacOrdinaryRate)} ordinaria, ` +
      `${percent(investmentTax.governmentBondsRate)} su quota titoli di Stato in modalità lorda.`,
    localTaxes: () => `dataset aliquote per Regione/Comune riferito al ${CURRENT_FISCAL_YEAR}.`
  };
  return descriptions[id]?.() ?? '';
}

function addLabelledParagraph(article, label, content) {
  const paragraph = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  paragraph.append(strong, content);
  article.append(paragraph);
  return paragraph;
}

export function renderFiscalRulesDocumentation() {
  document.querySelectorAll('[data-fiscal-year]').forEach((element) => {
    element.textContent = String(CURRENT_FISCAL_YEAR);
  });

  const container = document.getElementById('fiscal-source-list');
  if (!container) return;
  container.replaceChildren();

  for (const item of CURRENT_FISCAL_RULES.documentation) {
    const article = document.createElement('article');
    article.className = 'docs-source-item';
    article.dataset.fiscalRule = item.id;

    const title = document.createElement('h4');
    title.textContent = item.title;
    article.append(title);
    addLabelledParagraph(article, 'Valore usato', describeValue(item.id, CURRENT_FISCAL_RULES));

    const sourceParagraph = addLabelledParagraph(article, 'Fonte', `${item.sourceNote}. `);
    item.sources.forEach((source, index) => {
      if (index > 0) sourceParagraph.append(' · ');
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = source.label;
      sourceParagraph.append(link);
    });

    addLabelledParagraph(article, 'Aggiornamento', `${item.effective}.`);
    container.append(article);
  }
}
