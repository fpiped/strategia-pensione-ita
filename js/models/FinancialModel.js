import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';
import {
  calculateBonusCuneoFiscale,
  calculateEmployeeDeduction,
  calculateIncomeTax,
  calculateIrpefTaxableIncome,
  calculateTaxSavings,
  calculateTrattamentoIntegrativo,
  splitFpPayment
} from '../calculators/tax-calculator.js';
import {
  applyPeriodicVariation,
  calculateEmployerContribution,
  getAvailableDeductionLimit,
  getInitialEmployerContribution,
  getTotalDeductionLimit,
  resolveContributionBase,
  resolveEmployerContributionBase,
  splitBudget
} from '../calculators/pension-contributions.js';
import {
  applyYearGrowth,
  calculateEffectiveTaxRate,
  calculatePacExit,
  calculateStrategyExit,
  createGrowthOptions,
  projectFpContribution,
  projectPacContribution
} from '../calculators/investment-growth.js';

/**
 * FinancialModel - Contiene tutta la logica di business e i calcoli
 * Calcola l'evoluzione di un singolo investimento nel tempo
 */
export class FinancialModel {
    /**
     * Calcola tutti gli scenari finanziari basati sui parametri di input,
     * in entrambe le modalità di confronto (budget lordo e sacrificio netto).
     * @param {Object} config - Oggetto di configurazione con tutti i parametri
     * @returns {Object} Risultati e informazioni sul mix
     */
    calculateResults(config) {
      return this._simulateStrategies(this._normalizeConfig(config));
    }

    /**
     * Dati fiscali dell'esploratore annuale per l'anno selezionato:
     * variazioni, IRPEF, capienza deduzione e fiscalità di uscita vivono
     * qui; la view si limita a formattare. config è quello già mappato
     * dal controller (percentuali in frazione).
     */
    buildAnnualExplorerData(config, results, anno) {
      const row = results.find((item) => item.anno === anno) || results[0];
      if (!row) return null;
      const annoRif = row.anno;
      const varia = (base, tipo, freq, val) =>
        applyPeriodicVariation(base || 0, annoRif, tipo, freq || 0, val || 0);

      const redditoAnno = varia(config.reddito, config.variazioneRedditoTipo, config.variazioneRedditoFrequenza, config.variazioneRedditoValore);
      const investimentoAnno = varia(config.investimento, config.variazioneInvestimentoTipo, config.variazioneInvestimentoFrequenza, config.variazioneInvestimentoValore);
      const premiAnno = varia(config.premiStraordinari, config.variazionePremiTipo, config.variazionePremiFrequenza, config.variazionePremiValore);
      const altriRedditiAnno = varia(config.altriRedditi, config.variazioneAltriRedditiTipo, config.variazioneAltriRedditiFrequenza, config.variazioneAltriRedditiValore);
      const fpBase = config.baseContributivaFpTipo === 'ral' || (config.baseContributivaFp || 0) <= 0
        ? redditoAnno
        : varia(config.baseContributivaFp, config.variazioneBaseContributivaTipo, config.variazioneBaseContributivaFrequenza, config.variazioneBaseContributivaValore);

      const quotaFp = row.quotaFpConsigliata || 0;
      const datore = row.quotaDatore || 0;
      const risparmio = row.risparmioFiscale || 0;

      const redditoFiscaleAnno = redditoAnno + premiAnno + altriRedditiAnno;
      const imponibileIrpef = calculateIrpefTaxableIncome({
        reddito: redditoFiscaleAnno,
        contributiInpsPerc: config.contributiInpsPerc,
        massimaleContributivoInps: config.massimaleContributivoInps,
        sogliaIvsAggiuntivo: config.sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc: config.aliquotaIvsAggiuntivaPerc
      });
      const irpefLorda = calculateIncomeTax(imponibileIrpef);
      const addizionali = imponibileIrpef * (config.addizionaliPerc || 0);

      const limiteAnno = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP;
      const deduzioneUsata = quotaFp + datore;
      const rowsUpToYear = results.filter((item) => item.anno <= annoRif);
      const versatoFp = rowsUpToYear.reduce((tot, item) => tot + (item.quotaFpConsigliata || 0) + (item.quotaDatore || 0), 0);
      const tassoUscitaFp = this.calcolaTassazioneFp((config.anzianitaPregressaFp || 0) + annoRif - 1, Boolean(config.riscattoAnticipato));

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
        addizionali,
        aliquotaMarginale: imponibileIrpef <= 28000 ? 23 : imponibileIrpef <= 50000 ? 35 : 43,
        impostaAnnoLorda: irpefLorda + addizionali,
        limiteAnno,
        deduzioneUsata,
        capienzaResidua: Math.max(limiteAnno - deduzioneUsata, 0),
        aliquotaEffettiva: quotaFp > 0 ? (risparmio / quotaFp) * 100 : 0,
        versatoFp,
        versatoPac: rowsUpToYear.reduce((tot, item) => tot + (item.quotaPacConsigliata || 0), 0),
        anniPartecipazione: (config.anzianitaPregressaFp || 0) + annoRif,
        tassoUscitaFp,
        impostaUscitaFp: versatoFp * tassoUscitaFp,
        pacTassatoInUscita: config.rendimentoPacMode === 'lordo',
        aliquotaPacUscita: calculateEffectiveTaxRate(
          config.quotaAgevolataPacPerc || 0,
          FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_AGEVOLATA,
          FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_PAC_ORDINARIA
        ) * 100
      };
    }

    /**
     * Applica i default a tutti i parametri: un'unica definizione per
     * entrambe le modalità di confronto.
     */
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
        reinvestiRisparmio, modalitaCumulativa, riscattoAnticipato,
        anzianitaPregressaFp = 0,
        contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
        massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
        sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
        aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO,
        addizionaliPerc = 0, ulterioriDetrazioni = 0,
        modalitaConfronto = 'budgetLordo',
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
        quotaAgevolataFpPerc = 0,
        rendimentoPacMode = 'netto',
        costiAnnuiPacPerc = 0,
        quotaAgevolataPacPerc = 0
      } = config;

      return {
        durata, reddito, premiStraordinari, altriRedditi, investimento,
        variazionePremiTipo, variazionePremiFrequenza, variazionePremiValore,
        variazioneAltriRedditiTipo, variazioneAltriRedditiFrequenza, variazioneAltriRedditiValore,
        quotaDatoreFpPerc, contributoDatoreFisso, quotaMinAderentePerc,
        rendimentoAnnualeFpPerc, rendimentoAnnualePacPerc,
        reinvestiRisparmio, modalitaCumulativa, riscattoAnticipato,
        anzianitaPregressaFp,
        contributiInpsPerc, massimaleContributivoInps,
        sogliaIvsAggiuntivo, aliquotaIvsAggiuntivaPerc,
        addizionaliPerc, ulterioriDetrazioni,
        modalitaConfronto,
        variazioneRedditoTipo, variazioneRedditoFrequenza, variazioneRedditoValore,
        variazioneInvestimentoTipo, variazioneInvestimentoFrequenza, variazioneInvestimentoValore,
        baseContributivaFpTipo, baseContributivaFp,
        baseDatoreFpTipo, baseDatoreFp,
        variazioneBaseContributivaTipo, variazioneBaseContributivaFrequenza, variazioneBaseContributivaValore,
        modalitaVersamentoFp,
        rendimentoFpMode, costiAnnuiFpPerc, quotaAgevolataFpPerc,
        rendimentoPacMode, costiAnnuiPacPerc, quotaAgevolataPacPerc
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
        redditoFiscaleAnno: redditoAnno + premiAnno + altriRedditiAnno,
        quotaMinAderente: baseContributivaAnno * cfg.quotaMinAderentePerc,
        quotaDatorePotenziale: this._calculateEmployerContribution(baseDatoreAnno, cfg.quotaDatoreFpPerc, cfg.contributoDatoreFisso),
        budgetBase: cfg.modalitaCumulativa || anno === 1 ? investimentoAnno : 0,
        tassazioneFP: this.calcolaTassazioneFp(cfg.anzianitaPregressaFp + anno - 1, cfg.riscattoAnticipato),
        anniResidui: cfg.durata - anno + 1
      };
    }

    /**
     * Loop annuale unico per entrambe le modalità di confronto.
     *
     * A parità di budget lordo le tre strategie condividono contesto,
     * crescita ed exit; i due confronti divergono solo su tre punti:
     *  - budgetLordo: il risparmio fiscale è reinvestito (se richiesto) e
     *    conta nell'exit; il PAC di confronto investe tutto il budget.
     *  - sacrificioNetto: il risparmio fiscale rientra in tasca (mai
     *    reinvestito né contato nell'exit); il PAC di confronto investe
     *    solo il sacrificio netto (budget - risparmio della strategia FP).
     */
    _simulateStrategies(cfg) {
      const isNetSacrifice = cfg.modalitaConfronto === 'sacrificioNetto';
      const reinvestiRisparmio = isNetSacrifice ? false : cfg.reinvestiRisparmio;
      const includeTaxSavingsInExit = !isNetSacrifice;

      const optimizedResults = [];
      const fpStrategyResults = [];
      const pacStrategyResults = [];
      const rFP = cfg.rendimentoAnnualeFpPerc;
      const rPAC = cfg.rendimentoAnnualePacPerc;
      const growthOptions = this._createGrowthOptions(cfg);

      const fpPlan = this._createStrategyState();
      const pacPlan = this._createStrategyState();
      const recommendedPlan = this._createStrategyState();

      for (let anno = 1; anno <= cfg.durata; anno++) {
        const ctx = this._computeYearContext(cfg, anno);
        // Quota minima/extra derivate dalla quota entro deduzione.
        const minSplit = (quotaEntroDedAnno) => ({
          quotaEntroMinAnno: Math.min(quotaEntroDedAnno, ctx.quotaMinAderente),
          quotaExtraMinAnno: Math.max(quotaEntroDedAnno - ctx.quotaMinAderente, 0)
        });

        // Strategia FP pura: identica nei due confronti (a meno del
        // reinvestimento del risparmio nel budget).
        const fpBudget = ctx.budgetBase + (reinvestiRisparmio ? fpPlan.risparmioDaReinvestire : 0);
        const fpAllocation = this._splitBudget(fpBudget, ctx.quotaMinAderente, ctx.quotaDatorePotenziale);
        const fpPaymentSplit = this._chooseBestPaymentSplit({
          quotaFp: fpAllocation.quotaDeducibile,
          quotaDatore: fpAllocation.quotaDatore,
          quotaMinAderente: ctx.quotaMinAderente,
          modalitaVersamentoFp: cfg.modalitaVersamentoFp,
          reddito: ctx.redditoFiscaleAnno,
          contributiInpsPerc: cfg.contributiInpsPerc,
          massimaleContributivoInps: cfg.massimaleContributivoInps,
          sogliaIvsAggiuntivo: cfg.sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc: cfg.aliquotaIvsAggiuntivaPerc,
          addizionaliPerc: cfg.addizionaliPerc,
          ulterioriDetrazioni: cfg.ulterioriDetrazioni,
          limiteDeduzioneTotale: this._getTotalDeductionLimit()
        });
        const risparmioFpAnnoEffettivo = fpPaymentSplit.risparmio;

        // Parametri comuni ai due ottimizzatori dell'allocazione mix.
        const optimizerInputs = {
          quotaMinAderente: ctx.quotaMinAderente,
          quotaDatorePotenziale: ctx.quotaDatorePotenziale,
          reddito: ctx.redditoFiscaleAnno,
          contributiInpsPerc: cfg.contributiInpsPerc,
          massimaleContributivoInps: cfg.massimaleContributivoInps,
          sogliaIvsAggiuntivo: cfg.sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc: cfg.aliquotaIvsAggiuntivaPerc,
          addizionaliPerc: cfg.addizionaliPerc,
          ulterioriDetrazioni: cfg.ulterioriDetrazioni,
          modalitaVersamentoFp: cfg.modalitaVersamentoFp,
          rFP,
          rPAC,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          pacExitOptions: growthOptions.pac,
          anniResidui: ctx.anniResidui,
          tassazioneFP: ctx.tassazioneFP
        };

        // Punto di divergenza dei due confronti: budget del PAC puro,
        // ottimizzatore del mix e lettura delle quote nelle righe.
        let recommendedAllocation;
        let pacContributoAnno;
        let mixQuote;
        let pacQuote;
        if (isNetSacrifice) {
          const netSacrificeBudget = Math.max(ctx.budgetBase - risparmioFpAnnoEffettivo, 0);
          pacContributoAnno = netSacrificeBudget;
          recommendedAllocation = this._optimizeAllocation({
            ...optimizerInputs,
            netBudget: netSacrificeBudget,
            grossBudget: ctx.budgetBase
          });
          mixQuote = {
            quotaEntroDedAnno: recommendedAllocation.quotaFp,
            quotaExtraDedAnno: recommendedAllocation.quotaPac,
            aderenteAnno: recommendedAllocation.quotaFp + recommendedAllocation.quotaPac
          };
          pacQuote = {
            quotaEntroDedAnno: 0,
            quotaExtraDedAnno: netSacrificeBudget,
            aderenteAnno: netSacrificeBudget
          };
        } else {
          const recommendedBudget = ctx.budgetBase + (reinvestiRisparmio ? recommendedPlan.risparmioDaReinvestire : 0);
          pacContributoAnno = ctx.budgetBase;
          recommendedAllocation = this._optimizeAllocation({
            ...optimizerInputs,
            grossBudget: recommendedBudget
          });
          const recommendedCapacity = this._splitBudget(recommendedBudget, ctx.quotaMinAderente, ctx.quotaDatorePotenziale);
          const pacCapacity = this._splitBudget(ctx.budgetBase, ctx.quotaMinAderente, ctx.quotaDatorePotenziale);
          mixQuote = {
            quotaEntroDedAnno: recommendedCapacity.quotaDeducibile,
            quotaExtraDedAnno: recommendedCapacity.quotaExtraPac,
            aderenteAnno: recommendedBudget
          };
          pacQuote = {
            quotaEntroDedAnno: pacCapacity.quotaDeducibile,
            quotaExtraDedAnno: pacCapacity.quotaExtraPac,
            aderenteAnno: ctx.budgetBase
          };
        }

        this._applyYearGrowth(fpPlan, {
          fpContributo: fpAllocation.quotaDeducibile + fpAllocation.quotaDatore,
          pacContributo: fpAllocation.quotaExtraPac,
          risparmioAnno: risparmioFpAnnoEffettivo,
          rFP,
          rPAC,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio
        });
        this._applyYearGrowth(pacPlan, {
          fpContributo: 0,
          pacContributo: pacContributoAnno,
          risparmioAnno: 0,
          rFP,
          rPAC,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio
        });
        this._applyYearGrowth(recommendedPlan, {
          fpContributo: recommendedAllocation.quotaFp + recommendedAllocation.quotaDatore,
          pacContributo: recommendedAllocation.quotaPac,
          risparmioAnno: recommendedAllocation.risparmio,
          rFP,
          rPAC,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio
        });
        const exitFP = this._calculateStrategyExit(fpPlan, ctx.tassazioneFP, reinvestiRisparmio, includeTaxSavingsInExit, growthOptions.pac);
        const exitPAC = this._calculateStrategyExit(pacPlan, ctx.tassazioneFP, reinvestiRisparmio, includeTaxSavingsInExit, growthOptions.pac);
        const exitRecommended = this._calculateStrategyExit(recommendedPlan, ctx.tassazioneFP, reinvestiRisparmio, includeTaxSavingsInExit, growthOptions.pac);

        optimizedResults.push(this._createResultRow({
          anno,
          ...minSplit(mixQuote.quotaEntroDedAnno),
          quotaEntroDedAnno: mixQuote.quotaEntroDedAnno,
          quotaExtraDedAnno: mixQuote.quotaExtraDedAnno,
          aderenteAnno: mixQuote.aderenteAnno,
          datoreAnno: recommendedAllocation.quotaDatore,
          risparmioAnnoEffettivo: recommendedAllocation.risparmio,
          quotaFpConsigliataAnno: recommendedAllocation.quotaFp,
          quotaPacConsigliataAnno: recommendedAllocation.quotaPac,
          quotaBustaAnno: recommendedAllocation.quotaBusta,
          quotaBonificoAnno: recommendedAllocation.quotaBonifico,
          risparmioOttimizzazioneBustaAnno: recommendedAllocation.extraRisparmioVersamento,
          sceltaAnno: recommendedAllocation.scelta,
          exitFP,
          exitPAC,
          exitMix: exitRecommended
        }));

        fpStrategyResults.push(this._createResultRow({
          anno,
          ...minSplit(fpAllocation.quotaDeducibile),
          quotaEntroDedAnno: fpAllocation.quotaDeducibile,
          quotaExtraDedAnno: fpAllocation.quotaExtraPac,
          aderenteAnno: fpBudget,
          datoreAnno: fpAllocation.quotaDatore,
          risparmioAnnoEffettivo: risparmioFpAnnoEffettivo,
          quotaFpConsigliataAnno: fpAllocation.quotaDeducibile,
          quotaPacConsigliataAnno: fpAllocation.quotaExtraPac,
          quotaBustaAnno: fpPaymentSplit.quotaBusta,
          quotaBonificoAnno: fpPaymentSplit.quotaBonifico,
          risparmioOttimizzazioneBustaAnno: fpPaymentSplit.extraRisparmioVersamento,
          sceltaAnno: fpAllocation.quotaExtraPac > 0 ? 'MIX' : 'FP',
          exitFP,
          exitPAC,
          exitMix: exitFP
        }));

        pacStrategyResults.push(this._createResultRow({
          anno,
          ...minSplit(pacQuote.quotaEntroDedAnno),
          quotaEntroDedAnno: pacQuote.quotaEntroDedAnno,
          quotaExtraDedAnno: pacQuote.quotaExtraDedAnno,
          aderenteAnno: pacQuote.aderenteAnno,
          datoreAnno: 0,
          risparmioAnnoEffettivo: 0,
          quotaFpConsigliataAnno: 0,
          quotaPacConsigliataAnno: pacContributoAnno,
          quotaBustaAnno: 0,
          quotaBonificoAnno: 0,
          risparmioOttimizzazioneBustaAnno: 0,
          sceltaAnno: 'PAC',
          exitFP,
          exitPAC,
          exitMix: exitPAC
        }));
      }

      // La strategia migliore all'ultimo anno diventa la serie principale.
      const finalOptimized = optimizedResults.at(-1).exitMix;
      const finalFp = optimizedResults.at(-1).exitFp;
      const finalPac = optimizedResults.at(-1).exitPac;
      const selectedStrategy = [
        { results: optimizedResults, plan: recommendedPlan, exit: finalOptimized },
        { results: fpStrategyResults, plan: fpPlan, exit: finalFp },
        { results: pacStrategyResults, plan: pacPlan, exit: finalPac }
      ].reduce((best, current) => current.exit > best.exit ? current : best);
      const results = selectedStrategy.results;

      return {
        results,
        // Serie complete per vista tabella/esploratore per strategia.
        strategies: {
          mix: results,
          fp: fpStrategyResults,
          pac: pacStrategyResults
        },
        breakeven: this._calculateFirstFullFpYear(results),
        risparmioImposta: Math.round(selectedStrategy.plan.risparmioAccumulato),
        quotaDatoreFp: this._getInitialEmployerContribution({
          reddito: cfg.reddito,
          investimento: cfg.investimento,
          quotaDatoreFpPerc: cfg.quotaDatoreFpPerc,
          contributoDatoreFisso: cfg.contributoDatoreFisso,
          quotaMinAderentePerc: cfg.quotaMinAderentePerc,
          baseContributivaFpTipo: cfg.baseContributivaFpTipo,
          baseContributivaFp: cfg.baseContributivaFp,
          baseDatoreFpTipo: cfg.baseDatoreFpTipo,
          baseDatoreFp: cfg.baseDatoreFp
        })
      };
    }

    _createStrategyState() {
      return {
        montanteFP: 0,
        contributiFP: 0,
        montantePAC: 0,
        investimentoPAC: 0,
        risparmioAccumulato: 0,
        risparmioDaReinvestire: 0
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

    _getInitialEmployerContribution({
      reddito,
      investimento,
      quotaDatoreFpPerc,
      contributoDatoreFisso = 0,
      quotaMinAderentePerc,
      baseContributivaFpTipo = 'ral',
      baseContributivaFp = 0,
      baseDatoreFpTipo = 'same',
      baseDatoreFp = 0
    }) {
      return getInitialEmployerContribution({
        reddito,
        investimento,
        quotaDatoreFpPerc,
        contributoDatoreFisso,
        quotaMinAderentePerc,
        baseContributivaFpTipo,
        baseContributivaFp,
        baseDatoreFpTipo,
        baseDatoreFp
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

    _splitBudget(budget, quotaMinAderente, quotaDatorePotenziale) {
      return splitBudget(budget, quotaMinAderente, quotaDatorePotenziale);
    }

    /**
     * Cerca la quota FP (candidati euro per euro fino al limite deducibile)
     * che massimizza il totale netto a scadenza. Copre entrambi i confronti:
     * a parità di budget lordo (netBudget assente) e a parità di sacrificio
     * netto (netBudget presente), che differiscono solo nel budget PAC
     * residuo e nel trattamento del risparmio fiscale.
     */
    _optimizeAllocation({
      grossBudget,
      netBudget = null,
      quotaMinAderente,
      quotaDatorePotenziale,
      reddito,
      contributiInpsPerc,
      massimaleContributivoInps,
      sogliaIvsAggiuntivo,
      aliquotaIvsAggiuntivaPerc,
      addizionaliPerc,
      ulterioriDetrazioni,
      modalitaVersamentoFp,
      rFP,
      rPAC,
      fpGrowthOptions = {},
      pacGrowthOptions = {},
      pacExitOptions = {},
      anniResidui,
      tassazioneFP
    }) {
      const isNetSacrifice = netBudget !== null;
      if (grossBudget <= 0) {
        return {
          quotaFp: 0,
          quotaPac: 0,
          quotaDatore: 0,
          risparmio: 0,
          quotaBusta: 0,
          quotaBonifico: 0,
          scelta: 'PAC'
        };
      }

      const candidates = new Set([0]);
      const maxWithoutEmployer = Math.min(grossBudget, this._getAvailableDeductionLimit(0));
      const maxWithEmployer = Math.min(
        grossBudget,
        this._getAvailableDeductionLimit(quotaDatorePotenziale)
      );

      for (let amount = 0; amount <= Math.floor(maxWithoutEmployer); amount++) {
        candidates.add(amount);
      }
      candidates.add(maxWithoutEmployer);
      candidates.add(maxWithEmployer);
      candidates.add(Math.min(quotaMinAderente, grossBudget));

      // Il montante a scadenza di un contributo singolo è lineare nel
      // contributo: il fattore di capitalizzazione si calcola una volta sola
      // invece di rifare il loop sugli anni residui per ognuno dei
      // (potenziali) ~5.300 candidati.
      const fpFactor = this._projectFpContribution(1, rFP, anniResidui, fpGrowthOptions);
      const pacFactor = this._projectPacContribution(1, rPAC, anniResidui, pacGrowthOptions);
      const limiteDeduzioneTotale = this._getTotalDeductionLimit();

      let best = null;

      for (const candidate of candidates) {
        const quotaFp = Math.max(candidate, 0);
        const quotaDatore = quotaFp >= quotaMinAderente ? quotaDatorePotenziale : 0;
        const limiteDeduzione = this._getAvailableDeductionLimit(quotaDatore);

        if (quotaFp > grossBudget || quotaFp > limiteDeduzione) continue;

        const paymentSplit = this._chooseBestPaymentSplit({
          quotaFp,
          quotaDatore,
          quotaMinAderente,
          modalitaVersamentoFp,
          reddito,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          limiteDeduzioneTotale
        });
        const risparmio = paymentSplit.risparmio;
        const quotaPacGrezza = isNetSacrifice
          ? netBudget - quotaFp + risparmio
          : grossBudget - quotaFp;

        if (isNetSacrifice && quotaPacGrezza < -0.01) continue;

        const quotaPac = Math.max(quotaPacGrezza, 0);
        const fpContributo = quotaFp + quotaDatore;
        // A parità di budget lordo il risparmio fiscale rientra nell'exit FP;
        // a parità di sacrificio netto è già dentro il budget PAC residuo.
        const fpNetto = (fpContributo * fpFactor)
          - (fpContributo * tassazioneFP)
          + (isNetSacrifice ? 0 : risparmio);
        const pacNetto = this._calculatePacExit(quotaPac * pacFactor, quotaPac, pacExitOptions);
        const totaleNetto = fpNetto + pacNetto;

        if (!best || totaleNetto > best.totaleNetto) {
          best = { quotaFp, quotaPac, quotaDatore, risparmio, totaleNetto, ...paymentSplit };
        }
      }

      if (!best) {
        best = {
          quotaFp: 0,
          quotaPac: isNetSacrifice ? netBudget : grossBudget,
          quotaDatore: 0,
          risparmio: 0,
          totaleNetto: 0,
          quotaBusta: 0,
          quotaBonifico: 0
        };
      }

      const scelta = best.quotaFp <= 0
        ? 'PAC'
        : best.quotaPac <= 0
          ? 'FP'
          : 'MIX';

      return { ...best, scelta };
    }

    _applyYearGrowth(state, {
      fpContributo,
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
      quotaAgevolataFpPerc = 0,
      rendimentoPacMode = 'netto',
      costiAnnuiPacPerc = 0,
      quotaAgevolataPacPerc = 0
    } = {}) {
      return {
        fp: createGrowthOptions({
          mode: rendimentoFpMode,
          costiAnnui: costiAnnuiFpPerc,
          quotaAgevolataPerc: quotaAgevolataFpPerc,
          aliquotaAgevolata: FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_AGEVOLATA,
          aliquotaOrdinaria: FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_FP_ORDINARIA
        }),
        pac: createGrowthOptions({
          mode: rendimentoPacMode,
          costiAnnui: costiAnnuiPacPerc,
          quotaAgevolataPerc: quotaAgevolataPacPerc,
          aliquotaAgevolata: FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_AGEVOLATA,
          aliquotaOrdinaria: FINANCIAL_CONSTANTS.TASSAZIONE_RENDIMENTI_PAC_ORDINARIA
        })
      };
    }

    _projectFpContribution(contributo, rendimento, anni, options = {}) {
      return projectFpContribution(contributo, rendimento, anni, options);
    }

    _projectPacContribution(contributo, rendimento, anni, options = {}) {
      return projectPacContribution(contributo, rendimento, anni, options);
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
      quotaPacConsigliataAnno,
      quotaBustaAnno,
      quotaBonificoAnno,
      risparmioOttimizzazioneBustaAnno = 0,
      sceltaAnno,
      exitFP,
      exitPAC,
      exitMix
    }) {
      return {
        anno,
        quotaEntroMinima: Math.round(quotaEntroMinAnno),
        quotaExtraMinima: Math.round(quotaExtraMinAnno),
        quotaEntroDeduzione: Math.round(quotaEntroDedAnno),
        quotaExtraDeduzione: Math.round(quotaExtraDedAnno),
        quotaAderente: Math.round(aderenteAnno),
        quotaDatore: Math.round(datoreAnno),
        risparmioFiscale: Math.round(risparmioAnnoEffettivo),
        quotaFpConsigliata: Math.round(quotaFpConsigliataAnno),
        quotaPacConsigliata: Math.round(quotaPacConsigliataAnno),
        quotaFpBusta: Math.round(quotaBustaAnno),
        quotaFpBonifico: Math.round(quotaBonificoAnno),
        diffBustaBonifico: Math.round(risparmioOttimizzazioneBustaAnno),
        scelta: sceltaAnno,
        exitFp: Math.round(exitFP),
        exitPac: Math.round(exitPAC),
        exitMix: Math.round(exitMix)
      };
    }

    /**
     * Calcola il primo anno in cui tutta la quota deducibile va nel FP.
     * Prima di questo anno il mix puo comunque usare uno split FP/PAC.
     * @param {Array} results - Risultati dei calcoli
     * @returns {number|null} Primo anno FP pieno o null se non avviene
     */
    _calculateFirstFullFpYear(results) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].quotaEntroDeduzione > 0 && results[i].quotaFpConsigliata >= results[i].quotaEntroDeduzione) {
          return results[i].anno;
        }
      }
      return null;
    }

    /**
     * Calcola il risparmio fiscale dal contributo al fondo pensione.
     * @param {number} reddito - Reddito annuale
     * @param {number} investimento - Importo dell'investimento
     * @param {number} quotaDatoreFp - Contributo del datore
     * @param {number} addizionaliPerc - Aliquota stimata addizionali regionali/comunali
     * @param {number} ulterioriDetrazioni - Altre detrazioni annue stimate
     * @returns {number} Importo del risparmio fiscale
     */
    _chooseBestPaymentSplit({
      quotaFp,
      quotaDatore,
      quotaMinAderente,
      modalitaVersamentoFp,
      reddito,
      contributiInpsPerc,
      massimaleContributivoInps,
      sogliaIvsAggiuntivo,
      aliquotaIvsAggiuntivaPerc,
      addizionaliPerc,
      ulterioriDetrazioni,
      limiteDeduzioneTotale
    }) {
      const candidates = this._getPaymentSplitCandidates(quotaFp, quotaMinAderente, modalitaVersamentoFp);
      let best = null;

      for (const candidate of candidates) {
        const risparmio = quotaFp > 0
          ? this._calculateTaxSavings(
            reddito,
            quotaFp,
            quotaDatore,
            contributiInpsPerc,
            massimaleContributivoInps,
            sogliaIvsAggiuntivo,
            aliquotaIvsAggiuntivaPerc,
            addizionaliPerc,
            ulterioriDetrazioni,
            quotaMinAderente,
            modalitaVersamentoFp,
            limiteDeduzioneTotale,
            candidate.quotaBusta
          )
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
        ? this._calculateTaxSavings(
          reddito,
          quotaFp,
          quotaDatore,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          quotaMinAderente,
          'quotaMinimaBusta',
          limiteDeduzioneTotale,
          baselineSplit.quotaBusta
        )
        : 0;
      const allBustaSplit = this._splitFpPayment(quotaFp, quotaMinAderente, 'tuttoBusta');
      const risparmioTuttoBusta = quotaFp > 0
        ? this._calculateTaxSavings(
          reddito,
          quotaFp,
          quotaDatore,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          quotaMinAderente,
          'tuttoBusta',
          limiteDeduzioneTotale,
          allBustaSplit.quotaBusta
        )
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

    _calculateTaxSavings(
      reddito,
      investimento,
      quotaDatoreFp,
      contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
      massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
      sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
      aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO,
      addizionaliPerc = 0,
      ulterioriDetrazioni = 0,
      quotaMinAderente = 0,
      modalitaVersamentoFp = 'quotaMinimaBusta',
      limiteDeduzioneTotale = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP,
      quotaBustaFp = null
    ) {
      return calculateTaxSavings({
        reddito,
        investimento,
        quotaDatoreFp,
        contributiInpsPerc,
        massimaleContributivoInps,
        sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc,
        addizionaliPerc,
        ulterioriDetrazioni,
        quotaMinAderente,
        modalitaVersamentoFp,
        quotaBustaFp,
        limiteDeduzioneTotale
      });
    }

    _splitFpPayment(quotaFp, quotaMinAderente = 0, modalitaVersamentoFp = 'quotaMinimaBusta') {
      return splitFpPayment(quotaFp, quotaMinAderente, modalitaVersamentoFp);
    }

    _calculateTrattamentoIntegrativo(reddito, impostaLorda = 0, detrazioniLavoro = 0, ulterioriDetrazioni = 0) {
      return calculateTrattamentoIntegrativo({ reddito, impostaLorda, detrazioniLavoro, ulterioriDetrazioni });
    }

    _calculateBonusCuneoFiscale(redditoComplessivo) {
      return calculateBonusCuneoFiscale(redditoComplessivo);
    }

    _calculateIrpefTaxableIncome({
      reddito,
      contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
      massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
      sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
      aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO
    }) {
      return calculateIrpefTaxableIncome({
        reddito,
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
      if (riscattoAnticipato) {
        return 0.23; // Tassazione fissa 23% per riscatto anticipato
      }
      return Math.max((15 - Math.max(anni + 1 - 15, 0) * 0.3), 9) / 100;
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
        ['quotaPacConsigliata', 'PAC Cons'],
        ['quotaFpBusta', 'FP Busta'],
        ['quotaFpBonifico', 'FP Bonifico'],
        ['diffBustaBonifico', 'Diff Busta'],
        ['scelta', 'Scelta'],
        ['exitFp', 'Exit FP'],
        ['exitPac', 'Exit PAC'],
        ['exitMix', 'Exit Mix']
      ];

      const header = columns.map(([, label]) => label).join(',');
      const lines = rows.map((row) => columns.map(([key]) => row[key]).join(','));
      return [header, ...lines, ''].join('\r\n');
    }
  }
