import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';
import { CURRENT_FISCAL_RULES } from '../constants/fiscal-rules.js';
import { createCalculationAudit } from '../constants/calculation-methodology.js';
import {
  calculateEmployeeDeduction,
  calculateHighIncomeDetrazioniCut,
  calculateIncomeTax,
  calculateIrpefTaxableIncome,
  calculateNetTaxDue,
  calculateMarginalIncomeTaxRate,
  calculateTaxComparison,
  calculateTaxSavings,
  calculateTaxWedgeSupport,
  calculateTrattamentoIntegrativo,
  splitFpPayment
} from '../calculators/tax-calculator.js';
import {
  applyPeriodicVariation,
  calculateEmployerContribution,
  getAvailableDeductionLimit,
  getTotalDeductionLimit,
  resolveContributionBase,
  resolveEmployerContributionBase
} from '../calculators/pension-contributions.js';
import {
  applyFpAnnualGrowth,
  applyYearGrowth,
  calculateEffectiveTaxRate,
  calculateFpExitTaxBase,
  calculateNetAnnualReturn,
  calculatePacExitTax,
  calculatePacExit,
  calculateStrategyExit,
  createGrowthOptions
} from '../calculators/investment-growth.js';
import {
  calculateLocalTaxes,
  createFlatLocalTaxRules
} from '../calculators/local-tax-calculator.js';
import { buildFiscalThresholdInsights, getPresentedAllocation } from '../utils/result-presentation.js';
import { calculateStrategyIrr } from '../calculators/cash-flow-return.js';

// Un residuo PAC fino a 1 € nasce dalla griglia intera della quota FP e
// serve soltanto a riconciliare esattamente il budget netto. Resta nei
// calcoli, ma non trasforma una allocazione sostanzialmente FP in un MIX.
const TECHNICAL_PAC_RESIDUAL_MAX = 1 + 1e-9;

/**
 * FinancialModel - Contiene tutta la logica di business e i calcoli
 * Calcola l'evoluzione di un singolo investimento nel tempo
 */
export class FinancialModel {
    /**
     * Calcola il piano finanziario ottimale usando come input il sacrificio
     * netto personale annuo.
     * @param {Object} config - Oggetto di configurazione con tutti i parametri
     * @returns {Object} Risultati annuali del piano ottimizzato
     */
    calculateResults(config) {
      const cfg = this._normalizeConfig(config);
      const optimized = this._simulateOptimizedPlan(cfg);
      const strategies = [
        this._summarizeStrategy({
          id: 'optimized',
          label: 'Allocazione ottimizzata',
          description: 'Scelta annuale che massimizza il valore finale stimato.',
          methodologyIds: ['budget.net-identity', 'allocation.annual-search', 'allocation.sequential-policy'],
          results: optimized.results,
          feasible: true
        }),
        this._simulatePolicyPlan(cfg, 'all-pac'),
        this._simulatePolicyPlan(cfg, 'minimum-employer'),
        this._simulatePolicyPlan(cfg, 'maximum-fp')
      ];
      return { ...optimized, strategies };
    }

    /**
     * Dati fiscali dell'esploratore annuale per l'anno selezionato:
     * variazioni, IRPEF, limite di deduzione e fiscalità di uscita vivono
     * qui; la view si limita a formattare. config è quello già mappato
     * dal controller (percentuali in frazione).
     */
    buildAnnualExplorerData(config, results, anno) {
      const row = results.find((item) => item.anno === anno) || results[0];
      if (!row) return null;
      const annoRif = row.anno;
      const localTaxRules = Array.isArray(config.localTaxRules)
        ? config.localTaxRules
        : createFlatLocalTaxRules(config.addizionaliPerc);
      const varia = (base, tipo, freq, val) =>
        applyPeriodicVariation(base || 0, annoRif, tipo, freq || 0, val || 0);

      const redditoAnno = varia(config.reddito, config.variazioneRedditoTipo, config.variazioneRedditoFrequenza, config.variazioneRedditoValore);
      const investimentoPrevistoAnno = varia(config.investimento, config.variazioneInvestimentoTipo, config.variazioneInvestimentoFrequenza, config.variazioneInvestimentoValore);
      const investimentoAnno = config.modalitaCumulativa === false && annoRif > 1
        ? 0
        : investimentoPrevistoAnno;
      const premiAnno = varia(config.premiStraordinari, config.variazionePremiTipo, config.variazionePremiFrequenza, config.variazionePremiValore);
      const altriRedditiAnno = varia(config.altriRedditi, config.variazioneAltriRedditiTipo, config.variazioneAltriRedditiFrequenza, config.variazioneAltriRedditiValore);
      const fpBase = config.baseContributivaFpTipo === 'ral' || (config.baseContributivaFp || 0) <= 0
        ? redditoAnno
        : varia(config.baseContributivaFp, config.variazioneBaseContributivaTipo, config.variazioneBaseContributivaFrequenza, config.variazioneBaseContributivaValore);

      const quotaFp = row.quotaFpConsigliata || 0;
      const datore = row.quotaDatore || 0;
      const risparmio = row.risparmioFiscale || 0;

      const redditoLavoroAnno = redditoAnno + premiAnno;
      const redditoFiscaleAnno = redditoLavoroAnno + altriRedditiAnno;
      // L'INPS grava solo sul reddito da lavoro; gli altri redditi entrano
      // direttamente nell'imponibile IRPEF.
      const imponibileLavoro = calculateIrpefTaxableIncome({
        reddito: redditoLavoroAnno,
        contributiInpsPerc: config.contributiInpsPerc,
        massimaleContributivoInps: config.massimaleContributivoInps,
        sogliaIvsAggiuntivo: config.sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc: config.aliquotaIvsAggiuntivaPerc
      });
      const imponibileIrpef = imponibileLavoro + altriRedditiAnno;
      const irpefLorda = calculateIncomeTax(imponibileIrpef);
      const irpefLordaLavoro = calculateIncomeTax(imponibileLavoro);
      const detrazioneLavoro = calculateEmployeeDeduction(imponibileIrpef);
      const detrazioniOrdinarie = config.detrazioniOrdinarie || 0;
      const detrazioniTrattamentoIntegrativo = config.detrazioniTrattamentoIntegrativo || 0;
      const altreDetrazioniTotali = detrazioniOrdinarie + detrazioniTrattamentoIntegrativo;
      // Addizionali dovute solo se l'IRPEF netta dell'anno è positiva;
      // sopra la soglia redditi alti le detrazioni per oneri (art. 16-ter
      // TUIR) sono ridotte di 440€ — la detrazione lavoro resta intatta.
      const riduzioneDetrazioniAltiRedditi = calculateHighIncomeDetrazioniCut(imponibileIrpef);
      const altreDetrazioniUtilizzabili = Math.max(
        altreDetrazioniTotali - riduzioneDetrazioniAltiRedditi,
        0
      );
      const cuneo = calculateTaxWedgeSupport(imponibileIrpef, imponibileLavoro);
      const detrazioneCuneoUsata = Math.min(
        cuneo.taxDeduction,
        Math.max(irpefLorda - detrazioneLavoro - altreDetrazioniUtilizzabili, 0)
      );
      const {
        irpefNetta,
        addizionaliDovute: addizionali,
        impostaNetta
      } = calculateNetTaxDue({
        impostaLorda: irpefLorda,
        addizionali: calculateLocalTaxes(imponibileIrpef, localTaxRules),
        detrazioni: detrazioneLavoro + altreDetrazioniUtilizzabili + cuneo.taxDeduction
      });
      const trattamentoIntegrativo = calculateTrattamentoIntegrativo({
        redditoComplessivo: imponibileIrpef,
        impostaLordaLavoro: irpefLordaLavoro,
        impostaLordaComplessiva: irpefLorda,
        detrazioniLavoro: detrazioneLavoro,
        detrazioniRilevanti: detrazioniTrattamentoIntegrativo
      });
      const bonusCuneo = cuneo.cashAmount + detrazioneCuneoUsata;

      const limiteAnno = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP;
      const quotaFpDeducibile = row.quotaFpDeducibile ?? Math.min(quotaFp, Math.max(limiteAnno - datore, 0));
      const quotaFpNonDeducibile = row.quotaFpNonDeducibile ?? Math.max(quotaFp - quotaFpDeducibile, 0);
      const quotaDatoreDeducibile = row.quotaDatoreDeducibile ?? Math.min(datore, limiteAnno);
      const deduzioneUsata = Math.min(quotaFpDeducibile + quotaDatoreDeducibile, limiteAnno);
      const aliquotaMarginale = calculateMarginalIncomeTaxRate(imponibileIrpef) * 100;
      const rowsUpToYear = results.filter((item) => item.anno <= annoRif);
      const tassoUscitaFp = this.calcolaTassazioneFp((config.anzianitaPregressaFp || 0) + annoRif - 1, Boolean(config.riscattoAnticipato));
      // Il beneficio fiscale finanzia già i versamenti dello stesso anno:
      // non è un secondo capitale da aggiungere all'exit o all'anno seguente.
      const reinvestiRisparmio = false;
      const includeTaxSavingsInExit = false;
      const growthOptions = this._createGrowthOptions(config);
      const previousState = results.find((item) => item.anno === annoRif - 1)?._state;
      const annualState = row._state ? { ...row._state } : this._createPlanState();
      let openingFp = previousState?.montanteFP || 0;
      let openingPac = previousState?.montantePAC || 0;

      // Fallback per righe importate o costruite da versioni precedenti.
      if (!row._state) {
        for (const item of rowsUpToYear) {
          if (item.anno === annoRif) {
            openingFp = annualState.montanteFP;
            openingPac = annualState.montantePAC;
          }
          this._applyYearGrowth(annualState, {
            fpContributo: (item.quotaFpConsigliata || 0) + (item.quotaDatore || 0),
            fpContributoDeducibile: (item.quotaFpDeducibile ?? item.quotaFpConsigliata ?? 0)
              + (item.quotaDatoreDeducibile ?? item.quotaDatore ?? 0),
            pacContributo: item.quotaPacConsigliata || 0,
            risparmioAnno: item.risparmioFiscale || 0,
            rFP: config.rendimentoAnnualeFpPerc,
            rPAC: config.rendimentoAnnualePacPerc,
            fpGrowthOptions: growthOptions.fp,
            pacGrowthOptions: growthOptions.pac,
            reinvestiRisparmio
          });
        }
      }

      const netFpReturn = calculateNetAnnualReturn(config.rendimentoAnnualeFpPerc, {
        ...growthOptions.fp,
        taxTiming: growthOptions.fp.mode === 'lordo' ? 'annual' : 'none'
      });
      const netPacReturn = calculateNetAnnualReturn(config.rendimentoAnnualePacPerc, {
        ...growthOptions.pac,
        taxTiming: 'exit'
      });
      const pacExitTax = calculatePacExitTax(
        annualState.montantePAC,
        annualState.investimentoPAC,
        growthOptions.pac
      );
      const taxSavingExitValue = includeTaxSavingsInExit
        ? (reinvestiRisparmio ? annualState.risparmioDaReinvestire : annualState.risparmioAccumulato)
        : 0;

      const taxInputs = {
        reddito: redditoLavoroAnno,
        altriRedditi: altriRedditiAnno,
        investimento: quotaFp,
        quotaDatoreFp: datore,
        contributiInpsPerc: config.contributiInpsPerc,
        massimaleContributivoInps: config.massimaleContributivoInps,
        sogliaIvsAggiuntivo: config.sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc: config.aliquotaIvsAggiuntivaPerc,
        localTaxRules,
        detrazioniOrdinarie: config.detrazioniOrdinarie,
        detrazioniTrattamentoIntegrativo: config.detrazioniTrattamentoIntegrativo,
        quotaMinAderente: fpBase * (config.quotaMinAderentePerc || 0),
        modalitaVersamentoFp: config.modalitaVersamentoFp,
        limiteDeduzioneTotale: limiteAnno
      };
      const taxComparison = calculateTaxComparison({ ...taxInputs, quotaBustaFp: row.quotaFpBusta || 0 });
      const baselinePayroll = Math.min(quotaFp, taxInputs.quotaMinAderente);
      const baselineTaxComparison = calculateTaxComparison({ ...taxInputs, quotaBustaFp: baselinePayroll });
      const allPayrollTaxComparison = calculateTaxComparison({ ...taxInputs, quotaBustaFp: quotaFp });
      const fiscalThresholds = buildFiscalThresholdInsights({
        taxComparison,
        rules: CURRENT_FISCAL_RULES
      });

      return {
        redditoAnno,
        investimentoAnno,
        premiAnno,
        altriRedditiAnno,
        fpBase,
        quotaMinimaStimata: fpBase * (config.quotaMinAderentePerc || 0),
        redditoFiscaleAnno,
        imponibileIrpef,
        contributiInps: Math.max(redditoFiscaleAnno - imponibileIrpef, 0),
        irpefLorda,
        irpefLordaLavoro,
        addizionali,
        aliquotaMarginale,
        impostaAnnoLorda: irpefLorda + addizionali,
        detrazioneLavoro,
        detrazioniOrdinarie,
        detrazioniTrattamentoIntegrativo,
        altreDetrazioniTotali,
        riduzioneDetrazioniAltiRedditi,
        sogliaRedditiAlti: CURRENT_FISCAL_RULES.irpef.highIncomeAdjustment.threshold,
        irpefNetta,
        impostaNetta,
        trattamentoIntegrativo,
        bonusCuneo,
        sommaCuneo: cuneo.cashAmount,
        detrazioneCuneoNominale: cuneo.taxDeduction,
        detrazioneCuneoUsata,
        limiteAnno,
        deduzioneUsata,
        quotaFpDeducibile,
        quotaFpNonDeducibile,
        quotaDatoreDeducibile,
        capienzaResidua: Math.max(limiteAnno - deduzioneUsata, 0),
        limiteDisponibileAderente: Math.max(limiteAnno - datore, 0),
        quotaEntroMinima: row.quotaEntroMinima || 0,
        quotaExtraMinima: row.quotaExtraMinima || 0,
        quotaExtraDeduzione: row.quotaExtraDeduzione || 0,
        quotaPacOltreLimite: row.quotaPacOltreLimite || 0,
        diffBustaBonifico: row.diffBustaBonifico || 0,
        aliquotaEffettiva: quotaFp > 0 ? (risparmio / quotaFp) * 100 : 0,
        investimentoPersonaleAnno: row.investimentoLordo ?? (quotaFp + (row.quotaPacConsigliata || 0)),
        spesaEffettivaAnno: row.investimentoNetto ?? Math.max(quotaFp + (row.quotaPacConsigliata || 0) - risparmio, 0),
        beneficioInvestitoAnno: risparmio,
        totaleMessoAlLavoroAnno: quotaFp + (row.quotaPacConsigliata || 0) + datore,
        taxComparison,
        fiscalThresholds,
        risparmioBaselineBusta: baselineTaxComparison.saving,
        risparmioTuttoBusta: allPayrollTaxComparison.saving,
        openingFp,
        openingPac,
        rendimentoFpAnno: openingFp * netFpReturn,
        rendimentoPacAnno: openingPac * netPacReturn,
        costoFissoFpAnno: growthOptions.fp.mode === 'lordo' && (openingFp > 0 || quotaFp + datore > 0)
          ? growthOptions.fp.costoFissoAnnuo : 0,
        costoFissoPacAnno: growthOptions.pac.mode === 'lordo' && (openingPac > 0 || (row.quotaPacConsigliata || 0) > 0)
          ? growthOptions.pac.costoFissoAnnuo : 0,
        montanteFp: annualState.montanteFP,
        montantePac: annualState.montantePAC,
        liquiditaAccumulata: annualState.liquidita || 0,
        versatoFp: annualState.contributiFP,
        versatoFpDeducibile: annualState.contributiFpDeducibili,
        versatoFpNonDeducibile: annualState.contributiFpNonDeducibili,
        versatoPac: annualState.investimentoPAC,
        risparmioAccumulato: annualState.risparmioAccumulato,
        risparmioInExit: taxSavingExitValue,
        anniPartecipazione: (config.anzianitaPregressaFp || 0) + annoRif,
        tassoUscitaFp,
        impostaUscitaFp: calculateFpExitTaxBase(
          annualState.montanteFP,
          annualState.contributiFpDeducibili,
          annualState.contributiFpNonDeducibili
        ) * tassoUscitaFp,
        impostaUscitaPac: pacExitTax,
        pacTassatoInUscita: config.rendimentoPacMode === 'lordo',
        aliquotaPacUscita: calculateEffectiveTaxRate(
          config.quotaAgevolataPacPerc || 0,
          FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_AGEVOLATA,
          FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_PAC_ORDINARIA
        ) * 100
      };
    }

    /**
     * Frontiera esplorabile dell’anno: cambia soltanto la quota FP personale;
     * PAC o liquidità sono residui dell’identità di budget. Il valore è
     * proiettato all’orizzonte senza ipotizzare versamenti successivi.
     */
    buildAllocationFrontier(
      config,
      results,
      anno,
      requestedQuotaFp = null,
      strategyId = 'optimized'
    ) {
      const cfg = this._normalizeConfig(config);
      const row = results.find((item) => item.anno === anno) || results[0];
      if (!row) return null;
      const ctx = this._computeYearContext(cfg, row.anno);
      const growthOptions = this._createGrowthOptions(cfg);
      const planState = results.find((item) => item.anno === row.anno - 1)?._state
        || this._createPlanState();
      const tassazioneFpScadenza = this.calcolaTassazioneFp(
        cfg.anzianitaPregressaFp + cfg.durata - 1,
        cfg.riscattoAnticipato
      );
      const evaluator = this._createYearAllocationEvaluator(
        cfg,
        ctx,
        planState,
        growthOptions,
        tassazioneFpScadenza
      );
      const maximumFp = evaluator.findMaximumFp();
      const optimizedQuota = row._allocation?.quotaFp ?? row.quotaFpConsigliata ?? 0;
      const selectedQuota = requestedQuotaFp === null || !Number.isFinite(requestedQuotaFp)
        ? optimizedQuota
        : Math.min(Math.max(requestedQuotaFp, 0), maximumFp.quotaFp);
      const selected = evaluator.evaluate(selectedQuota, {
        residualDestination: 'pac',
        absorbTechnicalResidual: false
      });

      const point = (id, label, quotaFp, allocation) => ({
        id,
        label,
        quotaFp,
        feasible: Boolean(allocation),
        quotaPac: allocation?.quotaPac || 0,
        quotaDatore: allocation?.quotaDatore || 0,
        beneficioFiscale: allocation?.risparmio || 0,
        liquiditaResidua: allocation?.liquiditaResidua || 0,
        projectedExit: allocation?.valore ?? null
      });
      const allPac = evaluator.evaluate(0, { absorbTechnicalResidual: false });
      const minimum = evaluator.evaluate(ctx.quotaMinAderente, {
        residualDestination: 'pac',
        absorbTechnicalResidual: false
      });
      const optimized = evaluator.evaluate(optimizedQuota, {
        residualDestination: 'pac',
        absorbTechnicalResidual: false
      });

      return {
        anno: row.anno,
        budgetNetto: ctx.netInvestmentTarget,
        anniResidui: ctx.anniResidui,
        selected: point('selected', 'Quota scelta', selectedQuota, selected),
        minQuotaFp: 0,
        maxQuotaFp: maximumFp.quotaFp,
        criticalPoints: [
          point('all-pac', 'Tutto PAC', 0, allPac),
          point('minimum-employer', 'Minimo per datore', ctx.quotaMinAderente, minimum),
          point(
            'current-strategy',
            strategyId === 'optimized' ? 'Ottimo calcolato' : 'Quota della strategia',
            optimizedQuota,
            optimized
          ),
          point('maximum-fp', 'Massimo FP', maximumFp.quotaFp, maximumFp)
        ],
        audit: createCalculationAudit([
          'budget.net-identity',
          'budget.fiscal-cliffs',
          'allocation.annual-search',
          'allocation.sequential-policy'
        ], {
          anno: row.anno,
          budgetNetto: ctx.netInvestmentTarget,
          selectedQuotaFp: selectedQuota,
          selectedFeasible: Boolean(selected)
        })
      };
    }

    /** Applica i default alla modalità unica a investimento netto. */
    _normalizeConfig(config) {
      const {
        durata, reddito, premiStraordinari = 0, altriRedditi = 0, investimento,
        variazionePremiTipo = 'percentuale',
        variazionePremiFrequenza = 0,
        variazionePremiValore = 0,
        variazioneAltriRedditiTipo = 'percentuale',
        variazioneAltriRedditiFrequenza = 0,
        variazioneAltriRedditiValore = 0,
        quotaDatoreFpPerc, contributoDatoreFisso = 0, quotaMinAderentePerc,
        rendimentoAnnualeFpPerc, rendimentoAnnualePacPerc,
        modalitaCumulativa, riscattoAnticipato,
        anzianitaPregressaFp = 0,
        contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
        massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
        sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
        aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO,
        addizionaliPerc = 0, localTaxRules = null,
        detrazioniOrdinarie = config.ulterioriDetrazioni || 0,
        detrazioniTrattamentoIntegrativo = 0,
        variazioneRedditoTipo = 'percentuale',
        variazioneRedditoFrequenza = 0,
        variazioneRedditoValore = 0,
        variazioneInvestimentoTipo = 'percentuale',
        variazioneInvestimentoFrequenza = 0,
        variazioneInvestimentoValore = 0,
        baseContributivaFpTipo = 'ral',
        baseContributivaFp = 0,
        baseDatoreFpTipo = 'same',
        baseDatoreFp = 0,
        variazioneBaseContributivaTipo = 'percentuale',
        variazioneBaseContributivaFrequenza = 0,
        variazioneBaseContributivaValore = 0,
        modalitaVersamentoFp = 'quotaMinimaBusta',
        rendimentoFpMode = 'netto',
        costiAnnuiFpPerc = 0,
        costiFissiFp = 0,
        quotaAgevolataFpPerc = 0,
        rendimentoPacMode = 'netto',
        costiAnnuiPacPerc = 0,
        costiFissiPac = 0,
        quotaAgevolataPacPerc = 0
      } = config;

      return {
        durata, reddito, premiStraordinari, altriRedditi, investimento,
        variazionePremiTipo, variazionePremiFrequenza, variazionePremiValore,
        variazioneAltriRedditiTipo, variazioneAltriRedditiFrequenza, variazioneAltriRedditiValore,
        quotaDatoreFpPerc, contributoDatoreFisso, quotaMinAderentePerc,
        rendimentoAnnualeFpPerc, rendimentoAnnualePacPerc,
        modalitaCumulativa, riscattoAnticipato,
        anzianitaPregressaFp,
        contributiInpsPerc, massimaleContributivoInps,
        sogliaIvsAggiuntivo, aliquotaIvsAggiuntivaPerc,
        addizionaliPerc,
        localTaxRules: Array.isArray(localTaxRules)
          ? localTaxRules
          : createFlatLocalTaxRules(addizionaliPerc),
        detrazioniOrdinarie,
        detrazioniTrattamentoIntegrativo,
        variazioneRedditoTipo, variazioneRedditoFrequenza, variazioneRedditoValore,
        variazioneInvestimentoTipo, variazioneInvestimentoFrequenza, variazioneInvestimentoValore,
        baseContributivaFpTipo, baseContributivaFp,
        baseDatoreFpTipo, baseDatoreFp,
        variazioneBaseContributivaTipo, variazioneBaseContributivaFrequenza, variazioneBaseContributivaValore,
        modalitaVersamentoFp,
        rendimentoFpMode, costiAnnuiFpPerc, costiFissiFp, quotaAgevolataFpPerc,
        rendimentoPacMode, costiAnnuiPacPerc, costiFissiPac, quotaAgevolataPacPerc
      };
    }

    /**
     * Valori annuali comuni a tutte le strategie: redditi con variazioni
     * periodiche, basi contributive, quota minima, contributo datore
     * potenziale, budget dell'anno e fiscalità di uscita FP.
     */
    _computeYearContext(cfg, anno) {
      const redditoAnno = this._applyPeriodicVariation(
        cfg.reddito,
        anno,
        cfg.variazioneRedditoTipo,
        cfg.variazioneRedditoFrequenza,
        cfg.variazioneRedditoValore
      );
      const premiAnno = this._applyPeriodicVariation(
        Math.max(cfg.premiStraordinari, 0),
        anno,
        cfg.variazionePremiTipo,
        cfg.variazionePremiFrequenza,
        cfg.variazionePremiValore
      );
      const altriRedditiAnno = this._applyPeriodicVariation(
        Math.max(cfg.altriRedditi, 0),
        anno,
        cfg.variazioneAltriRedditiTipo,
        cfg.variazioneAltriRedditiFrequenza,
        cfg.variazioneAltriRedditiValore
      );
      const investimentoAnno = this._applyPeriodicVariation(
        cfg.investimento,
        anno,
        cfg.variazioneInvestimentoTipo,
        cfg.variazioneInvestimentoFrequenza,
        cfg.variazioneInvestimentoValore
      );
      const baseContributivaAnno = this._resolveContributionBase({
        redditoAnno,
        anno,
        baseContributivaFpTipo: cfg.baseContributivaFpTipo,
        baseContributivaFp: cfg.baseContributivaFp,
        variazioneBaseContributivaTipo: cfg.variazioneBaseContributivaTipo,
        variazioneBaseContributivaFrequenza: cfg.variazioneBaseContributivaFrequenza,
        variazioneBaseContributivaValore: cfg.variazioneBaseContributivaValore
      });
      const baseDatoreAnno = this._resolveEmployerContributionBase({
        redditoAnno,
        anno,
        baseQuotaAnno: baseContributivaAnno,
        baseDatoreFpTipo: cfg.baseDatoreFpTipo,
        baseDatoreFp: cfg.baseDatoreFp,
        variazioneBaseContributivaTipo: cfg.variazioneBaseContributivaTipo,
        variazioneBaseContributivaFrequenza: cfg.variazioneBaseContributivaFrequenza,
        variazioneBaseContributivaValore: cfg.variazioneBaseContributivaValore
      });

      return {
        // Reddito da lavoro (RAL + premi): paga l'INPS. Gli altri redditi
        // entrano solo nell'imponibile IRPEF.
        redditoLavoroAnno: redditoAnno + premiAnno,
        altriRedditiAnno,
        redditoFiscaleAnno: redditoAnno + premiAnno + altriRedditiAnno,
        quotaMinAderente: baseContributivaAnno * cfg.quotaMinAderentePerc,
        quotaDatorePotenziale: this._calculateEmployerContribution(baseDatoreAnno, cfg.quotaDatoreFpPerc, cfg.contributoDatoreFisso),
        netInvestmentTarget: cfg.modalitaCumulativa || anno === 1 ? investimentoAnno : 0,
        // Aliquota "se esci a fine di quest'anno": è quella giusta per le
        // colonne exit della tabella, non per le scelte di allocazione.
        tassazioneFP: this.calcolaTassazioneFp(cfg.anzianitaPregressaFp + anno - 1, cfg.riscattoAnticipato),
        anniResidui: cfg.durata - anno + 1
      };
    }

    _createYearAllocationEvaluator(
      cfg,
      yearContext,
      planState,
      growthOptions,
      tassazioneFpScadenza
    ) {
      return this._createAnnualAllocationEvaluator({
        netInvestmentTarget: yearContext.netInvestmentTarget,
        quotaMinAderente: yearContext.quotaMinAderente,
        quotaDatorePotenziale: yearContext.quotaDatorePotenziale,
        reddito: yearContext.redditoLavoroAnno,
        altriRedditi: yearContext.altriRedditiAnno,
        contributiInpsPerc: cfg.contributiInpsPerc,
        massimaleContributivoInps: cfg.massimaleContributivoInps,
        sogliaIvsAggiuntivo: cfg.sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc: cfg.aliquotaIvsAggiuntivaPerc,
        localTaxRules: cfg.localTaxRules,
        detrazioniOrdinarie: cfg.detrazioniOrdinarie,
        detrazioniTrattamentoIntegrativo: cfg.detrazioniTrattamentoIntegrativo,
        modalitaVersamentoFp: cfg.modalitaVersamentoFp,
        rFP: cfg.rendimentoAnnualeFpPerc,
        rPAC: cfg.rendimentoAnnualePacPerc,
        fpGrowthOptions: growthOptions.fp,
        pacGrowthOptions: growthOptions.pac,
        pacExitOptions: growthOptions.pac,
        anniResidui: yearContext.anniResidui,
        tassazioneFpScadenza,
        planState
      });
    }

    /**
     * Loop annuale con un solo piano ottimizzato. L'input è il sacrificio
     * netto personale e il beneficio fiscale finanzia versamenti aggiuntivi
     * nello stesso anno:
     * quota FP personale + quota PAC - beneficio = investimento netto.
     */
    _simulateOptimizedPlan(cfg) {
      const reinvestiRisparmio = false;
      const includeTaxSavingsInExit = false;

      const optimizedResults = [];
      const rFP = cfg.rendimentoAnnualeFpPerc;
      const rPAC = cfg.rendimentoAnnualePacPerc;
      const growthOptions = this._createGrowthOptions(cfg);

      const recommendedPlan = this._createPlanState();

      // L'ottimizzatore valuta ogni contributo a fine piano: l'imposta di
      // uscita va quindi presa all'orizzonte, con l'anzianità completa,
      // non all'anno del versamento.
      const tassazioneFpScadenza = this.calcolaTassazioneFp(
        cfg.anzianitaPregressaFp + cfg.durata - 1,
        cfg.riscattoAnticipato
      );

      for (let anno = 1; anno <= cfg.durata; anno++) {
        const ctx = this._computeYearContext(cfg, anno);
        // Quota minima/extra derivate dalla quota entro deduzione.
        const minSplit = (quotaEntroDedAnno) => ({
          quotaEntroMinAnno: Math.min(quotaEntroDedAnno, ctx.quotaMinAderente),
          quotaExtraMinAnno: Math.max(quotaEntroDedAnno - ctx.quotaMinAderente, 0)
        });

        const recommendedAllocation = this._createYearAllocationEvaluator(
          cfg,
          ctx,
          recommendedPlan,
          growthOptions,
          tassazioneFpScadenza
        ).findOptimal();
        const allocationQuote = {
          quotaEntroDedAnno: recommendedAllocation.quotaFpDeducibile,
          quotaExtraDedAnno: recommendedAllocation.quotaPac,
          aderenteAnno: recommendedAllocation.quotaFp + recommendedAllocation.quotaPac
        };
        this._applyYearGrowth(recommendedPlan, {
          fpContributo: recommendedAllocation.quotaFp + recommendedAllocation.quotaDatore,
          fpContributoDeducibile: recommendedAllocation.contributoFpDeducibile,
          pacContributo: recommendedAllocation.quotaPac,
          risparmioAnno: recommendedAllocation.risparmio,
          rFP,
          rPAC,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio
        });
        const exitRecommended = this._calculateStrategyExit(recommendedPlan, ctx.tassazioneFP, reinvestiRisparmio, includeTaxSavingsInExit, growthOptions.pac);

        optimizedResults.push(this._createResultRow({
          anno,
          ...minSplit(recommendedAllocation.quotaFp),
          quotaEntroDedAnno: allocationQuote.quotaEntroDedAnno,
          quotaExtraDedAnno: allocationQuote.quotaExtraDedAnno,
          aderenteAnno: allocationQuote.aderenteAnno,
          datoreAnno: recommendedAllocation.quotaDatore,
          risparmioAnnoEffettivo: recommendedAllocation.risparmio,
          quotaFpConsigliataAnno: recommendedAllocation.quotaFp,
          quotaFpDeducibileAnno: recommendedAllocation.quotaFpDeducibile,
          quotaFpNonDeducibileAnno: recommendedAllocation.quotaFpNonDeducibile,
          quotaDatoreDeducibileAnno: recommendedAllocation.quotaDatoreDeducibile,
          quotaPacConsigliataAnno: recommendedAllocation.quotaPac,
          quotaPacOltreLimiteAnno: recommendedAllocation.quotaPacOltreLimite,
          quotaBustaAnno: recommendedAllocation.quotaBusta,
          quotaBonificoAnno: recommendedAllocation.quotaBonifico,
          risparmioOttimizzazioneBustaAnno: recommendedAllocation.extraRisparmioVersamento,
          sceltaAnno: recommendedAllocation.scelta,
          investimentoNettoAnno: ctx.netInvestmentTarget,
          liquiditaResiduaAnno: recommendedAllocation.liquiditaResidua || 0,
          exitOttimale: exitRecommended,
          planState: recommendedPlan,
          methodologyIds: [
            'budget.net-identity',
            'tax.fp-deduction',
            'tax.employer-threshold',
            'tax.payment-split',
            'allocation.annual-search',
            'allocation.sequential-policy',
            'growth.annual-timing',
            'exit.fp',
            'exit.pac'
          ]
        }));
      }

      const finalOptimized = optimizedResults.at(-1).exitOttimale;
      const optimizedPlan = { results: optimizedResults, plan: recommendedPlan, exit: finalOptimized };
      const results = optimizedPlan.results;

      return {
        results,
        tir: {
          optimal: calculateStrategyIrr(results)
        },
        risparmioImposta: Math.round(optimizedPlan.plan.risparmioAccumulato),
        quotaDatoreFp: results[0]?.quotaDatore || 0
      };
    }

    /**
     * Simula un benchmark con regola fissa ma con lo stesso motore fiscale
     * dell’ottimizzatore. Le policy sono confrontate anno per anno allo stesso
     * budget personale netto.
     */
    _simulatePolicyPlan(cfg, policyId) {
      const definitions = {
        'all-pac': {
          label: 'Tutto PAC',
          description: 'Nessun versamento personale al fondo pensione.',
          methodologyIds: ['budget.net-identity', 'strategy.all-pac']
        },
        'minimum-employer': {
          label: 'Minimo FP + PAC',
          description: 'Solo il minimo necessario a ottenere il contributo del datore; residuo al PAC.',
          methodologyIds: ['budget.net-identity', 'tax.employer-threshold', 'strategy.minimum-employer']
        },
        'maximum-fp': {
          label: 'Massimo FP',
          description: 'Massima quota FP sostenibile, nessun PAC; eventuale residuo in liquidità.',
          methodologyIds: ['budget.net-identity', 'budget.fiscal-cliffs', 'strategy.maximum-fp']
        }
      };
      const definition = definitions[policyId];
      if (!definition) throw new Error(`Policy sconosciuta: ${policyId}`);

      const results = [];
      const plan = this._createPlanState();
      const growthOptions = this._createGrowthOptions(cfg);
      const tassazioneFpScadenza = this.calcolaTassazioneFp(
        cfg.anzianitaPregressaFp + cfg.durata - 1,
        cfg.riscattoAnticipato
      );
      let feasible = true;

      for (let anno = 1; anno <= cfg.durata; anno++) {
        const ctx = this._computeYearContext(cfg, anno);
        const evaluator = this._createYearAllocationEvaluator(
          cfg,
          ctx,
          plan,
          growthOptions,
          tassazioneFpScadenza
        );

        let allocation;
        if (ctx.netInvestmentTarget <= 0) {
          allocation = evaluator.findOptimal();
        } else if (policyId === 'all-pac') {
          allocation = evaluator.evaluate(0, { absorbTechnicalResidual: false });
        } else if (policyId === 'minimum-employer') {
          allocation = evaluator.evaluate(ctx.quotaMinAderente, {
            residualDestination: 'pac',
            absorbTechnicalResidual: false
          });
          if (!allocation) {
            feasible = false;
            allocation = evaluator.evaluate(0, { absorbTechnicalResidual: false });
          }
        } else {
          allocation = evaluator.findMaximumFp();
        }

        this._applyYearGrowth(plan, {
          fpContributo: allocation.quotaFp + allocation.quotaDatore,
          fpContributoDeducibile: allocation.contributoFpDeducibile,
          pacContributo: allocation.quotaPac,
          risparmioAnno: allocation.risparmio,
          rFP: cfg.rendimentoAnnualeFpPerc,
          rPAC: cfg.rendimentoAnnualePacPerc,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio: false
        });
        plan.liquidita += allocation.liquiditaResidua || 0;

        const exit = this._calculateStrategyExit(
          plan,
          ctx.tassazioneFP,
          false,
          false,
          growthOptions.pac
        );
        const quotaEntroMinima = Math.min(allocation.quotaFpDeducibile, ctx.quotaMinAderente);
        results.push(this._createResultRow({
          anno,
          quotaEntroMinAnno: quotaEntroMinima,
          quotaExtraMinAnno: Math.max(allocation.quotaFpDeducibile - quotaEntroMinima, 0),
          quotaEntroDedAnno: allocation.quotaFpDeducibile,
          quotaExtraDedAnno: allocation.quotaPac,
          aderenteAnno: allocation.quotaFp + allocation.quotaPac,
          datoreAnno: allocation.quotaDatore,
          risparmioAnnoEffettivo: allocation.risparmio,
          quotaFpConsigliataAnno: allocation.quotaFp,
          quotaFpDeducibileAnno: allocation.quotaFpDeducibile,
          quotaFpNonDeducibileAnno: allocation.quotaFpNonDeducibile,
          quotaDatoreDeducibileAnno: allocation.quotaDatoreDeducibile,
          quotaPacConsigliataAnno: allocation.quotaPac,
          quotaPacOltreLimiteAnno: allocation.quotaPacOltreLimite,
          quotaBustaAnno: allocation.quotaBusta,
          quotaBonificoAnno: allocation.quotaBonifico,
          risparmioOttimizzazioneBustaAnno: allocation.extraRisparmioVersamento || 0,
          sceltaAnno: allocation.scelta,
          investimentoNettoAnno: ctx.netInvestmentTarget,
          liquiditaResiduaAnno: allocation.liquiditaResidua || 0,
          exitOttimale: exit,
          planState: plan,
          methodologyIds: [
            ...definition.methodologyIds,
            'tax.fp-deduction',
            'tax.payment-split',
            'growth.annual-timing',
            'exit.fp',
            'exit.pac'
          ]
        }));
      }

      return this._summarizeStrategy({
        id: policyId,
        ...definition,
        results,
        feasible
      });
    }

    _summarizeStrategy({
      id,
      label,
      description,
      methodologyIds,
      results,
      feasible
    }) {
      const totals = results.reduce((sum, row) => {
        const allocation = row._allocation || {};
        sum.budgetNetto += allocation.investimentoNetto || 0;
        sum.fpPersonale += allocation.quotaFp || 0;
        sum.pac += allocation.quotaPac || 0;
        sum.datore += allocation.quotaDatore || 0;
        sum.beneficioFiscale += allocation.beneficioFiscale || 0;
        sum.liquidita += allocation.liquiditaResidua || 0;
        return sum;
      }, {
        budgetNetto: 0,
        fpPersonale: 0,
        pac: 0,
        datore: 0,
        beneficioFiscale: 0,
        liquidita: 0
      });
      const strategy = {
        id,
        label,
        description,
        feasible,
        results,
        exit: results.at(-1)?.exitOttimale || 0,
        tir: calculateStrategyIrr(results),
        totals
      };
      Object.defineProperty(strategy, '_audit', {
        value: createCalculationAudit(methodologyIds, {
          policyId: id,
          years: results.length,
          feasible,
          ...totals,
          exit: strategy.exit
        }),
        enumerable: false
      });
      return strategy;
    }

    _createPlanState() {
      return {
        montanteFP: 0,
        contributiFP: 0,
        contributiFpDeducibili: 0,
        contributiFpNonDeducibili: 0,
        montantePAC: 0,
        investimentoPAC: 0,
        risparmioAccumulato: 0,
        risparmioDaReinvestire: 0,
        liquidita: 0
      };
    }

    _applyPeriodicVariation(baseValue, year, type = 'percentuale', frequency = 0, value = 0) {
      return applyPeriodicVariation(baseValue, year, type, frequency, value);
    }

    _resolveContributionBase({
      redditoAnno,
      anno,
      baseContributivaFpTipo = 'ral',
      baseContributivaFp = 0,
      variazioneBaseContributivaTipo = 'percentuale',
      variazioneBaseContributivaFrequenza = 0,
      variazioneBaseContributivaValore = 0
    }) {
      return resolveContributionBase({
        redditoAnno,
        anno,
        baseContributivaFpTipo,
        baseContributivaFp,
        variazioneBaseContributivaTipo,
        variazioneBaseContributivaFrequenza,
        variazioneBaseContributivaValore
      });
    }

    _resolveEmployerContributionBase({
      redditoAnno,
      anno,
      baseQuotaAnno,
      baseDatoreFpTipo = 'same',
      baseDatoreFp = 0,
      variazioneBaseContributivaTipo = 'percentuale',
      variazioneBaseContributivaFrequenza = 0,
      variazioneBaseContributivaValore = 0
    }) {
      return resolveEmployerContributionBase({
        redditoAnno,
        anno,
        baseQuotaAnno,
        baseDatoreFpTipo,
        baseDatoreFp,
        variazioneBaseContributivaTipo,
        variazioneBaseContributivaFrequenza,
        variazioneBaseContributivaValore
      });
    }

    _calculateEmployerContribution(baseContributiva, quotaDatoreFpPerc, contributoDatoreFisso = 0) {
      return calculateEmployerContribution(baseContributiva, quotaDatoreFpPerc, contributoDatoreFisso);
    }

    _getTotalDeductionLimit() {
      return getTotalDeductionLimit();
    }

    _getAvailableDeductionLimit(quotaDatore = 0) {
      return getAvailableDeductionLimit(quotaDatore);
    }

    /**
     * Cerca la quota FP personale totale euro per euro nel tratto in cui la
     * fiscalità può cambiare. Oltre il plafond e le soglie contrattuali il
     * beneficio resta costante e il valore è affine: bastano gli estremi
     * esatti, evitando che budget molto grandi blocchino il browser.
     * Scelta qFP, il PAC riconcilia l'identità di budget.
     */
    _optimizeAllocation({
      netInvestmentTarget,
      quotaMinAderente,
      quotaDatorePotenziale,
      reddito,
      altriRedditi = 0,
      contributiInpsPerc,
      massimaleContributivoInps,
      sogliaIvsAggiuntivo,
      aliquotaIvsAggiuntivaPerc,
      localTaxRules,
      detrazioniOrdinarie,
      detrazioniTrattamentoIntegrativo,
      modalitaVersamentoFp,
      rFP,
      rPAC,
      fpGrowthOptions = {},
      pacGrowthOptions = {},
      pacExitOptions = {},
      anniResidui,
      tassazioneFpScadenza,
      planState = null
    }) {
      const evaluator = this._createAnnualAllocationEvaluator({
        netInvestmentTarget,
        quotaMinAderente,
        quotaDatorePotenziale,
        reddito,
        altriRedditi,
        contributiInpsPerc,
        massimaleContributivoInps,
        sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc,
        localTaxRules,
        detrazioniOrdinarie,
        detrazioniTrattamentoIntegrativo,
        modalitaVersamentoFp,
        rFP,
        rPAC,
        fpGrowthOptions,
        pacGrowthOptions,
        pacExitOptions,
        anniResidui,
        tassazioneFpScadenza,
        planState
      });
      return evaluator.findOptimal();
    }

    /**
     * Unico punto di verità per valutare qFP: fiscalità, riconciliazione del
     * budget e valore finanziario sono identici per ottimo e benchmark.
     */
    _createAnnualAllocationEvaluator({
      netInvestmentTarget,
      quotaMinAderente,
      quotaDatorePotenziale,
      reddito,
      altriRedditi = 0,
      contributiInpsPerc,
      massimaleContributivoInps,
      sogliaIvsAggiuntivo,
      aliquotaIvsAggiuntivaPerc,
      localTaxRules,
      detrazioniOrdinarie,
      detrazioniTrattamentoIntegrativo,
      modalitaVersamentoFp,
      rFP,
      rPAC,
      fpGrowthOptions = {},
      pacGrowthOptions = {},
      pacExitOptions = {},
      anniResidui,
      tassazioneFpScadenza,
      planState = null
    }) {
      const target = Number.isFinite(netInvestmentTarget)
        ? Math.max(netInvestmentTarget, 0)
        : 0;
      const maxWithoutEmployer = this._getAvailableDeductionLimit(0);
      const maxWithEmployer = this._getAvailableDeductionLimit(quotaDatorePotenziale);
      const limiteDeduzioneTotale = this._getTotalDeductionLimit();
      const fiscalCache = new Map();
      const paymentSplitCache = new Map();

      const getFiscalAllocation = (quotaFpTotale) => {
        const safeQuotaFp = Math.max(quotaFpTotale, 0);
        if (fiscalCache.has(safeQuotaFp)) return fiscalCache.get(safeQuotaFp);

        const quotaDatore = safeQuotaFp > 0 && safeQuotaFp >= quotaMinAderente
          ? quotaDatorePotenziale
          : 0;
        const limiteDeduzione = this._getAvailableDeductionLimit(quotaDatore);
        const massimoFpFiscale = quotaDatore > 0
          ? Math.max(limiteDeduzione, quotaMinAderente)
          : limiteDeduzione;
        const quotaFpFiscale = Math.min(safeQuotaFp, massimoFpFiscale);
        const quotaFpDeducibile = Math.min(safeQuotaFp, limiteDeduzione);
        const quotaFpNonDeducibile = Math.max(safeQuotaFp - quotaFpDeducibile, 0);
        const quotaDatoreDeducibile = Math.min(quotaDatore, limiteDeduzioneTotale);
        const quotaDatoreNonDeducibile = Math.max(quotaDatore - quotaDatoreDeducibile, 0);
        const contributoFpDeducibile = Math.min(
          quotaFpDeducibile + quotaDatoreDeducibile,
          limiteDeduzioneTotale
        );
        const paymentSplitKey = `${quotaFpFiscale}|${quotaDatore}`;
        let paymentSplit = paymentSplitCache.get(paymentSplitKey);
        if (!paymentSplit) {
          paymentSplit = this._chooseBestPaymentSplit({
            quotaFp: quotaFpFiscale,
            quotaDatore,
            quotaMinAderente,
            modalitaVersamentoFp,
            reddito,
            altriRedditi,
            contributiInpsPerc,
            massimaleContributivoInps,
            sogliaIvsAggiuntivo,
            aliquotaIvsAggiuntivaPerc,
            localTaxRules,
            detrazioniOrdinarie,
            detrazioniTrattamentoIntegrativo,
            limiteDeduzioneTotale
          });
          paymentSplitCache.set(paymentSplitKey, paymentSplit);
        }
        const allocation = {
          quotaFp: safeQuotaFp,
          quotaFpDeducibile,
          quotaFpNonDeducibile,
          quotaDatore,
          quotaDatoreDeducibile,
          quotaDatoreNonDeducibile,
          contributoFpDeducibile,
          massimoFpFiscale,
          ...paymentSplit,
          quotaBonifico: paymentSplit.quotaBonifico + Math.max(safeQuotaFp - quotaFpFiscale, 0)
        };
        fiscalCache.set(safeQuotaFp, allocation);
        return allocation;
      };

      let candidateData = null;
      const getCandidateData = () => {
        if (candidateData) return candidateData;
        const addIntegerNeighborhood = (set, value) => {
          if (!Number.isFinite(value)) return;
          const floor = Math.max(Math.floor(value), 0);
          for (let delta = -2; delta <= 2; delta++) {
            set.add(Math.max(floor + delta, 0));
          }
        };
        const fiscalCandidates = new Set([
          0,
          maxWithoutEmployer,
          maxWithEmployer,
          Math.max(quotaMinAderente, 0)
        ]);
        for (let amount = 0; amount <= Math.floor(maxWithoutEmployer); amount++) {
          fiscalCandidates.add(amount);
        }
        let maxTaxSaving = 0;
        for (const candidate of fiscalCandidates) {
          maxTaxSaving = Math.max(maxTaxSaving, getFiscalAllocation(candidate).risparmio);
        }
        const maxGrossInvestment = Math.max(target + maxTaxSaving, 0);
        const candidates = new Set(fiscalCandidates);
        [
          0,
          maxGrossInvestment,
          maxWithoutEmployer,
          maxWithEmployer,
          Math.max(quotaMinAderente, 0)
        ].forEach((value) => addIntegerNeighborhood(candidates, value));

        // In ciascun regime fiscale la quota che azzera il PAC soddisfa
        // qFP = budget + beneficio(qFP). L'iterazione converge subito nei
        // tratti a beneficio costante; tutte le soglie restano comunque
        // presenti esplicitamente nel set.
        const endpointAnchors = [
          0,
          maxWithoutEmployer,
          maxWithoutEmployer + 1,
          maxWithEmployer,
          maxWithEmployer + 1,
          Math.max(quotaMinAderente - 0.01, 0),
          Math.max(quotaMinAderente, 0),
          Math.max(quotaMinAderente + 0.01, 0),
          maxGrossInvestment
        ];
        for (const anchor of endpointAnchors) {
          let endpoint = Math.min(Math.max(anchor, 0), maxGrossInvestment);
          for (let iteration = 0; iteration < 8; iteration++) {
            addIntegerNeighborhood(candidates, endpoint);
            const next = Math.min(
              Math.max(target + getFiscalAllocation(endpoint).risparmio, 0),
              maxGrossInvestment
            );
            if (Math.abs(next - endpoint) < 1e-9) break;
            endpoint = next;
          }
          addIntegerNeighborhood(candidates, endpoint);
        }
        const sortedCandidates = [...candidates]
          .filter((candidate) => candidate <= maxGrossInvestment + 0.005)
          .sort((a, b) => a - b);
        candidateData = { maxGrossInvestment, sortedCandidates };
        return candidateData;
      };

      const evaluate = (quotaFpCandidate, {
        residualDestination = 'pac',
        absorbTechnicalResidual = true
      } = {}) => {
        const fiscalAllocation = getFiscalAllocation(quotaFpCandidate);
        const {
          quotaFp,
          quotaDatore,
          contributoFpDeducibile,
          massimoFpFiscale,
          risparmio
        } = fiscalAllocation;
        const netFpCost = quotaFp - risparmio;
        if (netFpCost > target + 1e-9) return null;

        const residual = Math.max(target - netFpCost, 0);
        const pacCalculated = residualDestination === 'pac' ? residual : 0;
        const absorb = absorbTechnicalResidual
          && residualDestination === 'pac'
          && quotaFp > 0
          && pacCalculated > 0
          && pacCalculated <= TECHNICAL_PAC_RESIDUAL_MAX
          && !(quotaFp < quotaMinAderente && target + risparmio >= quotaMinAderente);
        const quotaPac = absorb ? 0 : pacCalculated;
        const quotaFpEffettiva = quotaFp + (absorb ? pacCalculated : 0);
        const liquiditaResidua = residualDestination === 'cash' ? residual : 0;
        const eccedenzaOltreFp = Math.max((quotaFpEffettiva + quotaPac) - massimoFpFiscale, 0);
        const quotaPacOltreLimite = Math.min(quotaPac, eccedenzaOltreFp);
        const projectedPlan = this._projectPlanFromAllocation({
          planState,
          fpContributo: quotaFpEffettiva + quotaDatore,
          fpContributoDeducibile: contributoFpDeducibile,
          pacContributo: quotaPac,
          risparmioAnno: risparmio,
          rFP,
          rPAC,
          fpGrowthOptions,
          pacGrowthOptions,
          anniResidui
        });
        projectedPlan.liquidita = (projectedPlan.liquidita || 0) + liquiditaResidua;
        const valore = this._calculateStrategyExit(
          projectedPlan,
          tassazioneFpScadenza,
          false,
          false,
          pacExitOptions
        );
        const publicFiscalAllocation = { ...fiscalAllocation };
        delete publicFiscalAllocation.massimoFpFiscale;
        const scelta = quotaFpEffettiva < 0.5
          ? (quotaPac > 0 ? 'PAC' : 'NESSUNO')
          : quotaPac <= TECHNICAL_PAC_RESIDUAL_MAX
            ? 'FP'
            : 'MIX';
        return {
          ...publicFiscalAllocation,
          quotaFp: quotaFpEffettiva,
          quotaFpNonDeducibile: fiscalAllocation.quotaFpNonDeducibile
            + (absorb ? pacCalculated : 0),
          quotaBonifico: fiscalAllocation.quotaBonifico
            + (absorb ? pacCalculated : 0),
          quotaPac,
          quotaPacOltreLimite,
          liquiditaResidua,
          costoNettoFp: netFpCost,
          budgetDifference: target - (quotaFpEffettiva + quotaPac + liquiditaResidua - risparmio),
          totaleNetto: valore,
          valore,
          scelta
        };
      };

      const emptyAllocation = () => ({
        quotaFp: 0,
        quotaFpDeducibile: 0,
        quotaFpNonDeducibile: 0,
        quotaPac: 0,
        quotaPacOltreLimite: 0,
        quotaDatore: 0,
        quotaDatoreDeducibile: 0,
        quotaDatoreNonDeducibile: 0,
        contributoFpDeducibile: 0,
        risparmio: 0,
        quotaBusta: 0,
        quotaBonifico: 0,
        liquiditaResidua: 0,
        budgetDifference: 0,
        totaleNetto: 0,
        valore: 0,
        scelta: 'NESSUNO'
      });

      const findOptimal = () => {
        if (target <= 0) return emptyAllocation();
        const { sortedCandidates } = getCandidateData();
        let best = null;
        for (const candidate of sortedCandidates) {
          const allocation = evaluate(candidate);
          if (allocation && (!best || allocation.valore > best.valore + 1e-9)) {
            best = allocation;
          }
        }
        return best || evaluate(0) || emptyAllocation();
      };

      const findMaximumFp = () => {
        if (target <= 0) return emptyAllocation();
        const { sortedCandidates, maxGrossInvestment } = getCandidateData();
        let best = null;
        for (const candidate of sortedCandidates) {
          const allocation = evaluate(candidate, {
            residualDestination: 'cash',
            absorbTechnicalResidual: false
          });
          if (allocation && (!best || allocation.quotaFp > best.quotaFp + 1e-9)) {
            best = allocation;
          }
        }
        // Affina al centesimo il solo intervallo sopra l’ultimo euro
        // sostenibile: cattura il bordo immediatamente precedente a un cliff
        // senza moltiplicare per 100 tutta la scansione fiscale.
        const start = Math.floor(best?.quotaFp || 0);
        const end = Math.min(start + 1, maxGrossInvestment);
        for (let cents = Math.round(start * 100); cents <= Math.round(end * 100); cents++) {
          const allocation = evaluate(cents / 100, {
            residualDestination: 'cash',
            absorbTechnicalResidual: false
          });
          if (allocation && (!best || allocation.quotaFp > best.quotaFp + 1e-9)) {
            best = allocation;
          }
        }
        return best || evaluate(0, {
          residualDestination: 'cash',
          absorbTechnicalResidual: false
        }) || emptyAllocation();
      };

      return {
        target,
        quotaMinAderente,
        getFiscalAllocation,
        evaluate,
        findOptimal,
        findMaximumFp
      };
    }

    /**
     * Il target netto resta raggiungibile perché la capacità residua di ogni
     * quota FP sostenibile viene assegnata al PAC o al FP non dedotto, anche
     * in presenza di cliff fiscali.
     */
    _allocateNetInvestment(targetInvestment, optimizerInputs) {
      const target = Math.max(targetInvestment, 0);
      return this._optimizeAllocation({ ...optimizerInputs, netInvestmentTarget: target });
    }

    _applyYearGrowth(state, {
      fpContributo,
      fpContributoDeducibile = fpContributo,
      pacContributo,
      risparmioAnno,
      rFP,
      rPAC,
      fpGrowthOptions,
      pacGrowthOptions,
      reinvestiRisparmio
    }) {
      applyYearGrowth(state, {
        fpContributo,
        fpContributoDeducibile,
        pacContributo,
        risparmioAnno,
        rFP,
        rPAC,
        fpGrowthOptions,
        pacGrowthOptions,
        reinvestiRisparmio
      });
    }

    _createGrowthOptions({
      rendimentoFpMode = 'netto',
      costiAnnuiFpPerc = 0,
      costiFissiFp = 0,
      quotaAgevolataFpPerc = 0,
      rendimentoPacMode = 'netto',
      costiAnnuiPacPerc = 0,
      costiFissiPac = 0,
      quotaAgevolataPacPerc = 0
    } = {}) {
      return {
        fp: createGrowthOptions({
          mode: rendimentoFpMode,
          costiAnnui: costiAnnuiFpPerc,
          costoFissoAnnuo: costiFissiFp,
          quotaAgevolataPerc: quotaAgevolataFpPerc,
          aliquotaAgevolata: FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_AGEVOLATA,
          aliquotaOrdinaria: FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_FP_ORDINARIA
        }),
        pac: createGrowthOptions({
          mode: rendimentoPacMode,
          costiAnnui: costiAnnuiPacPerc,
          costoFissoAnnuo: costiFissiPac,
          quotaAgevolataPerc: quotaAgevolataPacPerc,
          aliquotaAgevolata: FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_AGEVOLATA,
          aliquotaOrdinaria: FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_PAC_ORDINARIA
        })
      };
    }

    _projectPlanFromAllocation({
      planState,
      fpContributo,
      fpContributoDeducibile,
      pacContributo,
      risparmioAnno,
      rFP,
      rPAC,
      fpGrowthOptions,
      pacGrowthOptions,
      anniResidui
    }) {
      const projected = {
        ...this._createPlanState(),
        ...(planState || {})
      };
      const years = Math.max(Math.floor(anniResidui || 0), 1);

      this._applyYearGrowth(projected, {
        fpContributo,
        fpContributoDeducibile,
        pacContributo,
        risparmioAnno,
        rFP,
        rPAC,
        fpGrowthOptions,
        pacGrowthOptions,
        reinvestiRisparmio: false
      });

      const remainingYears = years - 1;
      projected.montanteFP = this._projectFpBalanceWithoutContributions(
        projected.montanteFP,
        rFP,
        remainingYears,
        fpGrowthOptions
      );
      projected.montantePAC = this._projectPacBalanceWithoutContributions(
        projected.montantePAC,
        rPAC,
        remainingYears,
        pacGrowthOptions
      );

      return projected;
    }

    _projectFpBalanceWithoutContributions(balance, rendimento, years, options = {}) {
      if (!(balance > 0) || years <= 0) return Math.max(balance || 0, 0);
      if (options.mode !== 'lordo') {
        const annualReturn = calculateNetAnnualReturn(rendimento, options);
        return Math.max(balance * Math.pow(1 + annualReturn, years), 0);
      }

      // Con rendimento lordo la tassa annuale FP dipende dal risultato dopo
      // il costo fisso: la ricorrenza è a tratti e viene applicata esattamente.
      let projected = balance;
      for (let year = 0; year < years && projected > 0; year++) {
        projected = applyFpAnnualGrowth(projected, 0, rendimento, options);
      }
      return projected;
    }

    _projectPacBalanceWithoutContributions(balance, rendimento, years, options = {}) {
      if (!(balance > 0) || years <= 0) return Math.max(balance || 0, 0);
      const annualReturn = calculateNetAnnualReturn(rendimento, {
        ...options,
        taxTiming: 'exit'
      });
      const growth = 1 + annualReturn;
      const growthFactor = Math.pow(growth, years);
      const fixedCost = options.mode === 'lordo'
        ? Math.max(options.costoFissoAnnuo || 0, 0)
        : 0;
      if (!(fixedCost > 0)) return Math.max(balance * growthFactor, 0);

      const fixedCostFactor = Math.abs(growth - 1) < 1e-12
        ? years
        : (growthFactor - 1) / (growth - 1);
      return Math.max((balance * growthFactor) - (fixedCost * fixedCostFactor), 0);
    }

    _calculateStrategyExit(state, tassazioneFP, reinvestiRisparmio, includeTaxSavings = true, pacExitOptions = {}) {
      return calculateStrategyExit(state, tassazioneFP, reinvestiRisparmio, includeTaxSavings, pacExitOptions);
    }


    /**
     * Calcola il netto PAC. Il rendimento PAC inserito e gia netto di costi e fiscalita stimata.
     */
    _calculatePacExit(montante, investimentoTotale, options = {}) {
      return calculatePacExit(montante, investimentoTotale, options);
    }

    _createResultRow({
      anno,
      quotaEntroMinAnno,
      quotaExtraMinAnno,
      quotaEntroDedAnno,
      quotaExtraDedAnno,
      aderenteAnno,
      datoreAnno,
      risparmioAnnoEffettivo,
      quotaFpConsigliataAnno,
      quotaFpDeducibileAnno = quotaFpConsigliataAnno,
      quotaFpNonDeducibileAnno = 0,
      quotaDatoreDeducibileAnno = datoreAnno,
      quotaPacConsigliataAnno,
      quotaPacOltreLimiteAnno = 0,
      quotaBustaAnno,
      quotaBonificoAnno,
      risparmioOttimizzazioneBustaAnno = 0,
      sceltaAnno,
      investimentoNettoAnno,
      liquiditaResiduaAnno = 0,
      exitOttimale,
      planState = null,
      methodologyIds = []
    }) {
      const investimentoLordoAnno = quotaFpConsigliataAnno + quotaPacConsigliataAnno;
      const row = {
        anno,
        investimentoNetto: Math.round(investimentoNettoAnno),
        investimentoLordo: Math.round(investimentoLordoAnno),
        quotaEntroMinima: Math.round(quotaEntroMinAnno),
        quotaExtraMinima: Math.round(quotaExtraMinAnno),
        quotaEntroDeduzione: Math.round(quotaEntroDedAnno),
        quotaExtraDeduzione: Math.round(quotaExtraDedAnno),
        quotaAderente: Math.round(aderenteAnno),
        quotaDatore: Math.round(datoreAnno),
        risparmioFiscale: Math.round(risparmioAnnoEffettivo),
        quotaFpConsigliata: Math.round(quotaFpConsigliataAnno),
        quotaFpDeducibile: Math.round(quotaFpDeducibileAnno),
        quotaFpNonDeducibile: Math.round(quotaFpNonDeducibileAnno),
        quotaDatoreDeducibile: Math.round(quotaDatoreDeducibileAnno),
        quotaPacConsigliata: Math.round(quotaPacConsigliataAnno),
        quotaPacOltreLimite: Math.round(quotaPacOltreLimiteAnno),
        quotaFpBusta: Math.round(quotaBustaAnno),
        quotaFpBonifico: Math.round(quotaBonificoAnno),
        diffBustaBonifico: Math.round(risparmioOttimizzazioneBustaAnno),
        liquiditaResidua: Math.round(liquiditaResiduaAnno),
        scelta: sceltaAnno,
        exitOttimale: Math.round(exitOttimale)
      };
      // Mantiene le quote non arrotondate per distinguere un vero PAC da un
      // residuo tecnico. La proprietà non entra in CSV, link o Object.keys.
      Object.defineProperty(row, '_allocation', {
        value: {
          quotaFp: quotaFpConsigliataAnno,
          quotaPac: quotaPacConsigliataAnno,
          quotaDatore: datoreAnno,
          investimentoLordo: investimentoLordoAnno,
          investimentoNetto: investimentoNettoAnno,
          beneficioFiscale: risparmioAnnoEffettivo,
          liquiditaResidua: liquiditaResiduaAnno,
          budgetDifference: investimentoNettoAnno - (
            quotaFpConsigliataAnno
            + quotaPacConsigliataAnno
            + liquiditaResiduaAnno
            - risparmioAnnoEffettivo
          ),
          pacResidualTechnical: quotaFpConsigliataAnno > 0
            && quotaPacConsigliataAnno > 0
            && quotaPacConsigliataAnno <= TECHNICAL_PAC_RESIDUAL_MAX
        },
        enumerable: false
      });
      Object.defineProperty(row, '_audit', {
        value: createCalculationAudit(methodologyIds, {
          anno,
          investimentoNetto: investimentoNettoAnno,
          quotaFp: quotaFpConsigliataAnno,
          quotaPac: quotaPacConsigliataAnno,
          quotaDatore: datoreAnno,
          beneficioFiscale: risparmioAnnoEffettivo,
          liquiditaResidua: liquiditaResiduaAnno,
          budgetDifference: row._allocation.budgetDifference
        }),
        enumerable: false
      });
      // Dettaglio numerico esatto per l'esploratore. Non è enumerabile:
      // CSV, link condivisi e contratto pubblico delle righe restano invariati.
      if (planState) {
        Object.defineProperty(row, '_state', {
          value: { ...planState },
          enumerable: false
        });
      }
      return row;
    }

    /** Sceglie lo split busta/bonifico usando il confronto fiscale completo. */
    _chooseBestPaymentSplit({
      quotaFp,
      quotaDatore,
      quotaMinAderente,
      modalitaVersamentoFp,
      reddito,
      altriRedditi = 0,
      contributiInpsPerc,
      massimaleContributivoInps,
      sogliaIvsAggiuntivo,
      aliquotaIvsAggiuntivaPerc,
      localTaxRules,
      detrazioniOrdinarie,
      detrazioniTrattamentoIntegrativo,
      limiteDeduzioneTotale
    }) {
      const candidates = this._getPaymentSplitCandidates(quotaFp, quotaMinAderente, modalitaVersamentoFp);
      let best = null;

      for (const candidate of candidates) {
        const risparmio = quotaFp > 0
          ? this._calculateTaxSavings({
            reddito,
            investimento: quotaFp,
            quotaDatoreFp: quotaDatore,
            contributiInpsPerc,
            massimaleContributivoInps,
            sogliaIvsAggiuntivo,
            aliquotaIvsAggiuntivaPerc,
            localTaxRules,
            detrazioniOrdinarie,
            detrazioniTrattamentoIntegrativo,
            quotaMinAderente,
            modalitaVersamentoFp,
            limiteDeduzioneTotale,
            quotaBustaFp: candidate.quotaBusta,
            altriRedditi
          })
          : 0;

        if (!best || risparmio > best.risparmio + 0.005) {
          best = { ...candidate, risparmio };
        }
      }

      if (!best) {
        return {
          quotaBusta: 0,
          quotaBonifico: 0,
          risparmio: 0,
          risparmioBaselineVersamento: 0,
          extraRisparmioVersamento: 0
        };
      }

      const baselineSplit = this._splitFpPayment(quotaFp, quotaMinAderente, 'quotaMinimaBusta');
      const risparmioBaselineVersamento = quotaFp > 0
        ? this._calculateTaxSavings({
          reddito,
          investimento: quotaFp,
          quotaDatoreFp: quotaDatore,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          localTaxRules,
          detrazioniOrdinarie,
          detrazioniTrattamentoIntegrativo,
          quotaMinAderente,
          modalitaVersamentoFp: 'quotaMinimaBusta',
          limiteDeduzioneTotale,
          quotaBustaFp: baselineSplit.quotaBusta,
          altriRedditi
        })
        : 0;
      const allBustaSplit = this._splitFpPayment(quotaFp, quotaMinAderente, 'tuttoBusta');
      const risparmioTuttoBusta = quotaFp > 0
        ? this._calculateTaxSavings({
          reddito,
          investimento: quotaFp,
          quotaDatoreFp: quotaDatore,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          localTaxRules,
          detrazioniOrdinarie,
          detrazioniTrattamentoIntegrativo,
          quotaMinAderente,
          modalitaVersamentoFp: 'tuttoBusta',
          limiteDeduzioneTotale,
          quotaBustaFp: allBustaSplit.quotaBusta,
          altriRedditi
        })
        : 0;
      const differenzaBustaBonifico = risparmioTuttoBusta - risparmioBaselineVersamento;

      return {
        ...best,
        risparmioBaselineVersamento,
        extraRisparmioVersamento: differenzaBustaBonifico
      };
    }

    _getPaymentSplitCandidates(quotaFp, quotaMinAderente = 0, modalitaVersamentoFp = 'quotaMinimaBusta') {
      const safeQuotaFp = Math.max(quotaFp, 0);

      if (modalitaVersamentoFp !== 'ottimizza') {
        return [this._splitFpPayment(safeQuotaFp, quotaMinAderente, modalitaVersamentoFp)];
      }

      const quotaMinimaInBusta = Math.min(safeQuotaFp, Math.max(quotaMinAderente, 0));
      const quotaBustaCandidates = new Set([
        quotaMinimaInBusta,
        safeQuotaFp
      ]);

      return [...quotaBustaCandidates]
        .map((quotaBusta) => Math.min(Math.max(quotaBusta, quotaMinimaInBusta), safeQuotaFp))
        .sort((a, b) => a - b)
        .map((quotaBusta) => ({
          quotaBusta,
          quotaBonifico: Math.max(safeQuotaFp - quotaBusta, 0)
        }));
    }

    _calculateTaxSavings({
      reddito,
      investimento,
      quotaDatoreFp,
      contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
      massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
      sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
      aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO,
      localTaxRules = [],
      ulterioriDetrazioni = null,
      detrazioniOrdinarie = ulterioriDetrazioni ?? 0,
      detrazioniTrattamentoIntegrativo = 0,
      quotaMinAderente = 0,
      modalitaVersamentoFp = 'quotaMinimaBusta',
      limiteDeduzioneTotale = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP,
      quotaBustaFp = null,
      altriRedditi = 0
    }) {
      return calculateTaxSavings({
        reddito,
        altriRedditi,
        investimento,
        quotaDatoreFp,
        contributiInpsPerc,
        massimaleContributivoInps,
        sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc,
        localTaxRules,
        detrazioniOrdinarie,
        detrazioniTrattamentoIntegrativo,
        quotaMinAderente,
        modalitaVersamentoFp,
        quotaBustaFp,
        limiteDeduzioneTotale
      });
    }

    _splitFpPayment(quotaFp, quotaMinAderente = 0, modalitaVersamentoFp = 'quotaMinimaBusta') {
      return splitFpPayment(quotaFp, quotaMinAderente, modalitaVersamentoFp);
    }

    _calculateTrattamentoIntegrativo({
      redditoComplessivo,
      impostaLordaLavoro = 0,
      impostaLordaComplessiva = 0,
      detrazioniLavoro = 0,
      detrazioniRilevanti = 0
    }) {
      return calculateTrattamentoIntegrativo({
        redditoComplessivo,
        impostaLordaLavoro,
        impostaLordaComplessiva,
        detrazioniLavoro,
        detrazioniRilevanti
      });
    }

    _calculateIrpefTaxableIncome({
      reddito,
      altriRedditi = 0,
      contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
      massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
      sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
      aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO
    }) {
      return calculateIrpefTaxableIncome({
        reddito,
        altriRedditi,
        contributiInpsPerc,
        massimaleContributivoInps,
        sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc
      });
    }

    /**
     * Calcola la tassazione del fondo pensione in base alla durata
     * Parte dal 15%, scende dello 0.3% ogni anno dopo l'anno 15, minimo 9%
     * In caso di riscatto anticipato, la tassazione è fissa al 23%
     * @param {number} anni - Durata dell'investimento in anni
     * @param {boolean} riscattoAnticipato - Se è un riscatto anticipato totale
     * @returns {number} Aliquota di tassazione
     */
    calcolaTassazioneFp(anni, riscattoAnticipato = false) {
      const rules = CURRENT_FISCAL_RULES.pensionFund.exitTax;
      if (riscattoAnticipato) {
        return rules.earlyRedemptionRate;
      }
      const yearsWithReduction = Math.max(anni + 1 - rules.reductionStartsAfterYears, 0);
      return Math.max(
        rules.initialRate - yearsWithReduction * rules.reductionPerYear,
        rules.minimumRate
      );
    }

    /**
     * Calcola l'imposta sul reddito in base agli scaglioni progressivi IRPEF 2026.
     * Aggiornato alla Legge di Bilancio 2026 (secondo scaglione al 33%).
     * @param {number} reddito - Importo del reddito
     * @returns {number} Importo dell'imposta
     */
    calcolaImposta(reddito) {
      return calculateIncomeTax(reddito);
    }

    /**
     * Calcola le detrazioni per lavoro dipendente in base al reddito.
     * Aggiornato alla Legge 30 dicembre 2024, n. 207.
     * @param {number} reddito - Importo del reddito
     * @returns {number} Importo della detrazione
     */
    calcolaDetrazioniDipendente(reddito) {
      return calculateEmployeeDeduction(reddito);
    }

    /**
     * Converte i risultati in formato CSV con intestazioni leggibili
     * (le righe internamente usano chiavi camelCase stabili).
     * @param {Array} rows - Dati dei risultati
     * @returns {string} Stringa formattata CSV
     */
    convertToCSV(rows) {
      if (!rows.length) return '';

      const columns = [
        ['anno', 'Anno'],
        ['quotaEntroMinima', 'Entro Min'],
        ['quotaExtraMinima', 'Extra Min'],
        ['quotaEntroDeduzione', 'Entro Ded'],
        ['quotaExtraDeduzione', 'Extra Ded'],
        ['quotaAderente', 'Aderente'],
        ['quotaDatore', 'Datore'],
        ['risparmioFiscale', 'Risparmio'],
        ['quotaFpConsigliata', 'FP Cons'],
        ['quotaFpDeducibile', 'FP Deducibile'],
        ['quotaFpNonDeducibile', 'FP Non Deducibile'],
        ['quotaDatoreDeducibile', 'Datore Deducibile'],
        ['quotaPacConsigliata', 'PAC Cons'],
        ['quotaPacOltreLimite', 'PAC Oltre Limite'],
        ['quotaFpBusta', 'FP Busta'],
        ['quotaFpBonifico', 'FP Bonifico'],
        ['diffBustaBonifico', 'Diff Busta'],
        ['scelta', 'Scelta'],
        ['investimentoNetto', 'Investimento Netto'],
        ['investimentoLordo', 'Investimento Lordo'],
        ['liquiditaResidua', 'Liquidita Residua'],
        ['exitOttimale', 'Exit Ottimale']
      ];

      const header = columns.map(([, label]) => label).join(',');
      const lines = rows.map((row) => {
        const allocation = getPresentedAllocation(row);
        return columns.map(([key]) => {
          if (key === 'quotaFpConsigliata') return allocation.fp;
          if (key === 'quotaPacConsigliata') return allocation.pac;
          if (key === 'scelta') return allocation.choice;
          return row[key];
        }).join(',');
      });
      return [header, ...lines, ''].join('\r\n');
    }
  }
