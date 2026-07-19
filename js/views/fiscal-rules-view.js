import { CURRENT_FISCAL_RULES, CURRENT_FISCAL_YEAR } from '../constants/fiscal-rules.js';

const money = (value) => `${value.toLocaleString('it-IT', { useGrouping: 'always' })} €`;
const percent = (value) => `${(value * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

const SOURCE_GROUPS = [
  {
    title: 'Reddito da lavoro e contributi previdenziali',
    description: 'Come si passa dal reddito lordo all’imponibile sul quale viene calcolata l’IRPEF.',
    ids: ['inpsRate', 'inpsCeiling', 'additionalIvs']
  },
  {
    title: 'IRPEF, detrazioni e sostegni al reddito',
    description: 'Imposta lorda, detrazione da lavoro, trattamento integrativo, somma cuneo e detrazione cuneo sono passaggi distinti.',
    ids: ['irpef', 'employeeDeduction', 'supplementaryTreatment', 'taxWedgeBonus', 'localTaxes']
  },
  {
    title: 'Previdenza complementare',
    description: 'Limite deducibile, tassazione della prestazione e ipotesi di uscita anticipata dal fondo pensione.',
    ids: ['pensionDeduction', 'nonDeductedContributions', 'pensionExitTax', 'earlyRedemption', 'pensionInvestmentTax']
  },
  {
    title: 'PAC e investimenti finanziari',
    description: 'Fiscalità applicata alla plusvalenza del PAC quando il rendimento è inserito in modalità lorda.',
    ids: ['pacCapitalGain']
  }
];

function describeValue(id, rules) {
  const { irpef, pensionFund, inps, supplementaryTreatment, taxWedgeBonus, investmentTax } = rules;
  const descriptions = {
    irpef: () => {
      const brackets = irpef.brackets;
      return `${percent(brackets[0].rate)} fino a ${money(brackets[0].upTo)}, ` +
        `${percent(brackets[1].rate)} fino a ${money(brackets[1].upTo)}, ` +
        `${percent(brackets[2].rate)} oltre; sopra ${money(irpef.highIncomeAdjustment.threshold)} ` +
        `di reddito complessivo il beneficio del taglio è sterilizzato riducendo ` +
        `le detrazioni di ${money(irpef.highIncomeAdjustment.amount)}.`;
    },
    employeeDeduction: () => `${money(irpef.employeeDeduction.minimumAmount)}.`,
    pensionDeduction: () => `${money(pensionFund.deductionLimit)}/anno, datore incluso e TFR escluso.`,
    pensionExitTax: () => `${percent(pensionFund.exitTax.initialRate)}, ` +
      `-${percent(pensionFund.exitTax.reductionPerYear)}/anno oltre il ` +
      `${pensionFund.exitTax.reductionStartsAfterYears}°, minimo ${percent(pensionFund.exitTax.minimumRate)}.`,
    nonDeductedContributions: () => 'esclusi dalla base imponibile finale, assumendo la comunicazione al fondo.',
    earlyRedemption: () => `${percent(pensionFund.exitTax.earlyRedemptionRate)} sui contributi dedotti.`,
    inpsRate: () => `${percent(inps.employeeRate)}, modificabile.`,
    inpsCeiling: () => `${money(inps.contributionCeiling)}.`,
    additionalIvs: () => `+${percent(inps.additionalIvsRate)} oltre ${money(inps.additionalIvsThreshold)}.`,
    supplementaryTreatment: () => `${money(supplementaryTreatment.amount)}/anno; fino a ` +
      `${money(supplementaryTreatment.fullThreshold)} con capienza sulla sola IRPEF da lavoro, ` +
      `poi con detrazioni ammesse fino a ${money(supplementaryTreatment.maximumThreshold)}.`,
    taxWedgeBonus: () => `somma integrativa fino a ${money(taxWedgeBonus.thresholds[2])}; ` +
      `detrazione ${money(taxWedgeBonus.fullDeduction)} tra ${money(taxWedgeBonus.thresholds[2])} ` +
      `e ${money(taxWedgeBonus.thresholds[4])}, entro la capienza IRPEF.`,
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

  const itemsById = new Map(CURRENT_FISCAL_RULES.documentation.map((item) => [item.id, item]));
  for (const group of SOURCE_GROUPS) {
    const section = document.createElement('section');
    section.className = 'docs-source-group';
    const heading = document.createElement('h3');
    heading.textContent = group.title;
    const description = document.createElement('p');
    description.textContent = group.description;
    section.append(heading, description);

    for (const id of group.ids) {
      const item = itemsById.get(id);
      if (!item) continue;
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
      section.append(article);
    }
    container.append(section);
  }
}
