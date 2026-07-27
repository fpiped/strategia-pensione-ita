import { CURRENT_FISCAL_RULES, CURRENT_FISCAL_YEAR } from './fiscal-rules.js';

export const CALCULATION_METHODOLOGY_VERSION = `2026.1-${CURRENT_FISCAL_YEAR}`;

/**
 * Registro delle decisioni di modello.
 *
 * Le regole normative restano in fiscal-rules.js; qui è documentato come
 * quelle regole vengono trasformate in un calcolo. Gli ID sono parte del
 * contratto di audit: risultati e strategie li usano senza duplicare testi.
 */
export const CALCULATION_METHODS = [
  {
    id: 'budget.net-identity',
    area: 'Budget e confrontabilità',
    title: 'Budget personale netto',
    decision: 'L’input rappresenta il sacrificio economico personale dell’anno.',
    formula: 'B = qFP + qPAC + liquidità − beneficioFiscale',
    rationale: 'Consente di confrontare allocazioni diverse a parità di esborso personale, anche quando la fiscalità produce salti.',
    sourceRuleIds: ['pensionDeduction'],
    approximations: [],
    implementation: ['FinancialModel._createAnnualAllocationEvaluator', 'FinancialModel._simulatePolicyPlan']
  },
  {
    id: 'budget.fiscal-cliffs',
    area: 'Budget e confrontabilità',
    title: 'Salti fiscali e liquidità residua',
    decision: 'Non si presume che ogni budget netto abbia una soluzione tutto FP esatta; si prende la massima quota FP sostenibile e il residuo resta liquidità.',
    formula: 'q* = max{q : q − S(q) ≤ B}; liquidità = B − (q* − S(q*))',
    rationale: 'Detrazioni, incapienza ed esenzioni rendono S(q) non necessariamente continua o invertibile.',
    sourceRuleIds: ['employeeDeduction', 'supplementaryTreatment', 'taxWedgeBonus', 'localTaxes'],
    approximations: ['La liquidità residua è mantenuta nominale e non produce rendimento.'],
    implementation: ['FinancialModel._createAnnualAllocationEvaluator', 'FinancialModel._simulatePolicyPlan']
  },
  {
    id: 'timeline.periodic-variation',
    area: 'Sequenza annuale',
    title: 'Variazioni periodiche',
    decision: 'Reddito, budget e basi contributive cambiano all’inizio dell’anno indicato dalla frequenza.',
    formula: 'x_t = variazionePeriodica(x_1, t, tipo, frequenza, valore)',
    rationale: 'Un’unica convenzione temporale evita disallineamenti tra reddito, fiscalità e versamenti.',
    sourceRuleIds: [],
    approximations: ['Le variazioni sono deterministiche e non modellano inflazione o incertezza separatamente.'],
    implementation: ['pension-contributions.applyPeriodicVariation', 'FinancialModel._computeYearContext']
  },
  {
    id: 'tax.inps',
    area: 'Fiscalità annuale',
    title: 'Contributi INPS e imponibile IRPEF',
    decision: 'L’INPS è applicata al solo reddito da lavoro; gli altri redditi entrano direttamente nell’imponibile IRPEF.',
    formula: 'imponibileIRPEF = redditoLavoro − INPS(redditoLavoro) + altriRedditi',
    rationale: 'Separa correttamente base previdenziale e reddito fiscale.',
    sourceRuleIds: ['inpsRate', 'inpsCeiling', 'additionalIvs'],
    approximations: ['Il massimale INPS è applicato a tutti gli scenari, senza distinguere la storia assicurativa del lavoratore.'],
    implementation: ['tax-calculator.calculateIrpefTaxableIncome']
  },
  {
    id: 'tax.irpef-and-deductions',
    area: 'Fiscalità annuale',
    title: 'IRPEF, detrazioni e addizionali',
    decision: 'Imposta lorda, detrazione da lavoro, altre detrazioni, sostegni e addizionali sono ricalcolati per ciascun candidato FP.',
    formula: 'impostaNetta = max(IRPEF_lorda − detrazioni, 0) + addizionaliDovute',
    rationale: 'Il beneficio FP non coincide sempre con aliquota marginale × deduzione a causa di capienza e soglie.',
    sourceRuleIds: ['irpef', 'employeeDeduction', 'supplementaryTreatment', 'taxWedgeBonus', 'localTaxes'],
    approximations: ['Oltre 200.000 € la riduzione di 440 € è applicata alle detrazioni aggregate inserite, senza classificare gli oneri esclusi.'],
    implementation: ['tax-calculator.calculateTaxComparison', 'local-tax-calculator.calculateLocalTaxes']
  },
  {
    id: 'tax.fp-deduction',
    area: 'Fiscalità annuale',
    title: 'Deduzione fondo pensione',
    decision: 'Il limite comprende contributo personale e datore; l’eccedenza personale è registrata come non dedotta.',
    formula: 'deducibile = min(qFP + qDatore, limite); nonDedotto = max(qFP − limiteDisponibile, 0)',
    rationale: 'Evita sia un beneficio inesistente sia una seconda tassazione in uscita dei contributi comunicati come non dedotti.',
    sourceRuleIds: ['pensionDeduction', 'nonDeductedContributions'],
    approximations: ['Si assume che i contributi non dedotti siano comunicati correttamente al fondo.'],
    implementation: ['pension-contributions.getAvailableDeductionLimit', 'FinancialModel._createAnnualAllocationEvaluator']
  },
  {
    id: 'tax.employer-threshold',
    area: 'Fiscalità annuale',
    title: 'Soglia per il contributo datore',
    decision: 'Il contributo del datore è riconosciuto solo se la quota personale raggiunge il minimo contrattuale.',
    formula: 'qDatore(q) = qDatorePotenziale se q ≥ qMin; 0 altrimenti',
    rationale: 'Rappresenta il salto economico fondamentale dell’adesione.',
    sourceRuleIds: ['pensionDeduction'],
    approximations: ['La soglia è modellata come condizione annuale binaria sulla base inserita.'],
    implementation: ['FinancialModel._createAnnualAllocationEvaluator']
  },
  {
    id: 'tax.payment-split',
    area: 'Fiscalità annuale',
    title: 'Versamento in busta o bonifico',
    decision: 'La modalità automatica confronta minimo in busta e tutto in busta; la quota oltre plafond passa via bonifico.',
    formula: 'split* = argmax_split S(qFP, split)',
    rationale: 'Il versamento in busta può modificare imponibile e misure sul reddito in modo diverso dal bonifico.',
    sourceRuleIds: ['irpef', 'employeeDeduction', 'supplementaryTreatment', 'taxWedgeBonus', 'localTaxes', 'pensionDeduction'],
    approximations: ['Non vengono enumerate tutte le possibili ripartizioni intermedie tra busta e bonifico.'],
    implementation: ['FinancialModel._chooseBestPaymentSplit']
  },
  {
    id: 'allocation.annual-search',
    area: 'Allocazione',
    title: 'Ricerca annuale della quota FP',
    decision: 'La quota FP è scandita a passi di 1 € nel tratto fiscalmente variabile, includendo tutte le soglie esatte; oltre il tratto, dove il beneficio è costante e il valore affine, si confrontano gli estremi esatti.',
    formula: 'qPAC = B + S(qFP) − qFP',
    rationale: 'Preserva la ricerca diretta presso le discontinuità fiscali senza far dipendere il tempo di calcolo dall’intero budget, che può essere molto grande.',
    sourceRuleIds: [],
    approximations: ['Nel tratto fiscalmente variabile la risoluzione ordinaria è 1 €; un residuo PAC fino a 1 € può essere assorbito nel FP non dedotto per non aprire uno strumento tecnico.'],
    implementation: ['FinancialModel._createAnnualAllocationEvaluator', 'FinancialModel._optimizeAllocation']
  },
  {
    id: 'allocation.sequential-policy',
    area: 'Allocazione',
    title: 'Politica ottimizzata sequenziale',
    decision: 'Ogni anno sceglie il contributo che massimizza il valore a fine orizzonte sullo stato già accumulato, senza anticipare versamenti futuri.',
    formula: 'q_t* = argmax_q V_T(stato_{t−1}, q; versamenti futuri = 0)',
    rationale: 'Rende la decisione spiegabile e computazionalmente stabile senza un’esplosione combinatoria pluriennale.',
    sourceRuleIds: [],
    approximations: ['Non è una dimostrazione di ottimo globale.', 'I costi fissi futuri possono rendere diversa la soluzione globale perché sarebbero ammortizzati sullo stesso conto.'],
    implementation: ['FinancialModel._simulatePolicyPlan', 'FinancialModel._projectPlanFromAllocation']
  },
  {
    id: 'strategy.all-pac',
    area: 'Strategie di confronto',
    title: 'Tutto PAC',
    decision: 'La quota FP è zero e l’intero budget personale confluisce nel PAC.',
    formula: 'qFP = 0; qPAC = B',
    rationale: 'È il benchmark sempre esistente, senza beneficio fiscale né contributo datore.',
    sourceRuleIds: ['pacCapitalGain'],
    approximations: [],
    implementation: ['FinancialModel._simulatePolicyPlan']
  },
  {
    id: 'strategy.minimum-employer',
    area: 'Strategie di confronto',
    title: 'Minimo FP per il datore + PAC',
    decision: 'Si versa il minimo personale che sblocca il datore e si assegna al PAC il budget residuo.',
    formula: 'qFP = qMin; qPAC = B + S(qMin) − qMin',
    rationale: 'Isola il valore economico dell’incentivo datoriale senza forzare ulteriore FP.',
    sourceRuleIds: ['pensionDeduction'],
    approximations: ['Se il minimo non è sostenibile con il budget, la strategia è marcata non fattibile e usa il PAC come ripiego.'],
    implementation: ['FinancialModel._simulatePolicyPlan']
  },
  {
    id: 'strategy.maximum-fp',
    area: 'Strategie di confronto',
    title: 'Massimo FP senza PAC',
    decision: 'Si sceglie la massima quota FP con costo netto non superiore al budget; l’eventuale differenza resta liquidità.',
    formula: 'qFP = max{q : q − S(q) ≤ B}; qPAC = 0',
    rationale: 'Definisce un benchmark rigoroso anche quando un “tutto FP” esatto non esiste.',
    sourceRuleIds: ['pensionDeduction'],
    approximations: ['La liquidità residua ha rendimento nominale zero.'],
    implementation: ['FinancialModel._simulatePolicyPlan']
  },
  {
    id: 'growth.annual-timing',
    area: 'Rendimenti e costi',
    title: 'Capitalizzazione annuale posticipata',
    decision: 'Il montante esistente cresce e sostiene i costi dell’anno; il nuovo contributo è aggiunto a fine periodo.',
    formula: 'M_t = crescita(M_{t−1}) + contributo_t − costoFisso_t',
    rationale: 'Applica la stessa convenzione temporale a tutte le strategie.',
    sourceRuleIds: ['pensionInvestmentTax', 'pacCapitalGain'],
    approximations: ['Rendimenti e costi percentuali sono costanti e deterministici.'],
    implementation: ['investment-growth.applyFpAnnualGrowth', 'investment-growth.applyPacAnnualGrowth']
  },
  {
    id: 'growth.fixed-costs',
    area: 'Rendimenti e costi',
    title: 'Costi fissi per strumento',
    decision: 'Ogni costo fisso è applicato una volta per strumento e anno attivo, non per singolo versamento.',
    formula: 'costo_t = costoFisso se montante_{t−1} > 0 o contributo_t > 0; 0 altrimenti',
    rationale: 'Il costo appartiene al conto aggregato.',
    sourceRuleIds: [],
    approximations: ['Nella scelta sequenziale non si anticipa che futuri versamenti potrebbero ammortizzare il costo già attivato.'],
    implementation: ['investment-growth.applyFpAnnualGrowth', 'investment-growth.applyPacAnnualGrowth']
  },
  {
    id: 'growth.negative-returns',
    area: 'Rendimenti e costi',
    title: 'Rendimenti negativi fuori perimetro',
    decision: 'Gli input di rendimento FP e PAC sono limitati a valori non negativi.',
    formula: 'rFP ≥ 0; rPAC ≥ 0',
    rationale: 'Il modello non gestisce riporti fiscali, minusvalenze e compensazioni necessari per trattare correttamente scenari negativi.',
    sourceRuleIds: ['pensionInvestmentTax', 'pacCapitalGain'],
    approximations: ['Non sono simulate perdite di mercato; il capitale può ridursi soltanto per effetto dei costi.'],
    implementation: ['index.html inputs rendimentoFp/rendimentoPac', 'investment-growth.calculateNetAnnualReturn']
  },
  {
    id: 'exit.fp',
    area: 'Valore di uscita',
    title: 'Uscita fondo pensione',
    decision: 'L’aliquota FP si applica alla parte dedotta restituibile; i contributi non dedotti sono esclusi dalla base.',
    formula: 'exitFP = MFP − aliquotaUscita × min(contributiDedotti, max(MFP − contributiNonDedotti, 0))',
    rationale: 'Evita tassazione doppia e un’imposta superiore alla prestazione disponibile.',
    sourceRuleIds: ['pensionExitTax', 'nonDeductedContributions', 'earlyRedemption'],
    approximations: ['È un equivalente economico netto e non simula vincoli tra capitale, rendita, anticipazioni e causali concrete.'],
    implementation: ['investment-growth.calculateFpExitTaxBase', 'investment-growth.calculateFpExit']
  },
  {
    id: 'exit.pac',
    area: 'Valore di uscita',
    title: 'Uscita PAC',
    decision: 'In modalità lorda, l’imposta di uscita è applicata solo alla plusvalenza positiva.',
    formula: 'exitPAC = MPAC − aliquota × max(MPAC − capitaleVersato, 0)',
    rationale: 'Separa capitale e rendimento imponibile.',
    sourceRuleIds: ['pacCapitalGain'],
    approximations: ['Non sono modellate minusvalenze riportabili o compensazioni con altri strumenti.'],
    implementation: ['investment-growth.calculatePacExitTax', 'investment-growth.calculatePacExit']
  },
  {
    id: 'return.irr',
    area: 'Valore di uscita',
    title: 'TIR sul budget personale',
    decision: 'Il TIR usa come flussi negativi i budget personali annuali e come flusso finale il valore netto della strategia.',
    formula: '0 = Σ_t(−B_t/(1+TIR)^t) + exit/(1+TIR)^T',
    rationale: 'Mantiene confrontabili strategie con diverso lordo investito e diverso beneficio fiscale.',
    sourceRuleIds: [],
    approximations: ['Il TIR è una sintesi deterministica e non misura rischio o volatilità.'],
    implementation: ['cash-flow-return.calculateStrategyIrr']
  }
];

const METHODS_BY_ID = new Map(CALCULATION_METHODS.map((method) => [method.id, method]));
const SOURCES_BY_ID = new Map(
  CURRENT_FISCAL_RULES.documentation.map((source) => [source.id, source])
);

export function getCalculationMethod(id) {
  return METHODS_BY_ID.get(id) || null;
}

export function resolveCalculationMethod(id) {
  const method = getCalculationMethod(id);
  if (!method) return null;
  return {
    ...method,
    sources: method.sourceRuleIds
      .map((sourceId) => SOURCES_BY_ID.get(sourceId))
      .filter(Boolean)
  };
}

export function createCalculationAudit(methodologyIds, values = {}) {
  const uniqueIds = [...new Set(methodologyIds)];
  const unknownIds = uniqueIds.filter((id) => !METHODS_BY_ID.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Metodologia sconosciuta: ${unknownIds.join(', ')}`);
  }
  return Object.freeze({
    methodologyVersion: CALCULATION_METHODOLOGY_VERSION,
    methodologyIds: Object.freeze(uniqueIds),
    values: Object.freeze({ ...values })
  });
}
