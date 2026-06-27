import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';

/**
 * FinancialModel - Contiene tutta la logica di business e i calcoli
 * Calcola l'evoluzione di un singolo investimento nel tempo
 */
export class FinancialModel {
    /**
     * Calcola tutti gli scenari finanziari basati sui parametri di input
     * Supporta 4 combinazioni: singolo/cumulativo x reinvesti/non-reinvesti
     * @param {Object} config - Oggetto di configurazione con tutti i parametri
     * @returns {Object} Risultati e informazioni sul mix
     */
    calculateResults(config) {
      const {
        durata, reddito, premiStraordinari = 0, investimento,
        quotaDatoreFpPerc, contributoDatoreFisso = 0, quotaMinAderentePerc,
        rendimentoAnnualeFpPerc, rendimentoAnnualePacPerc,
        reinvestiRisparmio, modalitaCumulativa, riscattoAnticipato,
        anzianitaPregressaFp = 0,
        contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
        massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
        sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
        aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO,
        addizionaliPerc = 0, ulterioriDetrazioni = 0,
        primaOccupazionePost2006 = false,
        plafondExtraPrimaOccupazione = 0,
        anniResiduiMaggiorazione = FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNI,
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
        modalitaVersamentoFp = 'quotaMinimaBusta'
      } = config;

      if (modalitaConfronto === 'sacrificioNetto') {
        return this._calculateNetSacrificeResults(config);
      }

      const optimizedResults = [];
      const fpStrategyResults = [];
      const pacStrategyResults = [];
      const rFP = rendimentoAnnualeFpPerc;
      const rPAC = rendimentoAnnualePacPerc;

      const firstEmploymentConfig = {
        enabled: primaOccupazionePost2006,
        extraRemaining: plafondExtraPrimaOccupazione,
        yearsRemaining: anniResiduiMaggiorazione
      };

      const fpPlan = this._createStrategyState(firstEmploymentConfig);
      const pacPlan = this._createStrategyState(firstEmploymentConfig);
      const recommendedPlan = this._createStrategyState(firstEmploymentConfig);

      for (let anno = 1; anno <= durata; anno++) {
        const redditoAnno = this._applyPeriodicVariation(
          reddito,
          anno,
          variazioneRedditoTipo,
          variazioneRedditoFrequenza,
          variazioneRedditoValore
        );
        const redditoFiscaleAnno = redditoAnno + Math.max(premiStraordinari, 0);
        const investimentoAnno = this._applyPeriodicVariation(
          investimento,
          anno,
          variazioneInvestimentoTipo,
          variazioneInvestimentoFrequenza,
          variazioneInvestimentoValore
        );
        const baseContributivaAnno = this._resolveContributionBase({
          redditoAnno,
          anno,
          baseContributivaFpTipo,
          baseContributivaFp,
          variazioneBaseContributivaTipo,
          variazioneBaseContributivaFrequenza,
          variazioneBaseContributivaValore
        });
        const baseDatoreAnno = this._resolveEmployerContributionBase({
          redditoAnno,
          anno,
          baseQuotaAnno: baseContributivaAnno,
          baseDatoreFpTipo,
          baseDatoreFp,
          variazioneBaseContributivaTipo,
          variazioneBaseContributivaFrequenza,
          variazioneBaseContributivaValore
        });
        const quotaMinAderente = baseContributivaAnno * quotaMinAderentePerc;
        const quotaDatorePotenziale = this._calculateEmployerContribution(baseDatoreAnno, quotaDatoreFpPerc, contributoDatoreFisso);
        const budgetBaseAnno = modalitaCumulativa || anno === 1 ? investimentoAnno : 0;
        const tassazioneFP = this.calcolaTassazioneFp(anzianitaPregressaFp + anno - 1, riscattoAnticipato);
        const anniResidui = durata - anno + 1;

        const fpBudget = budgetBaseAnno + (reinvestiRisparmio ? fpPlan.risparmioDaReinvestire : 0);
        const pacBudget = budgetBaseAnno;
        const recommendedBudget = budgetBaseAnno + (reinvestiRisparmio ? recommendedPlan.risparmioDaReinvestire : 0);

        const fpAllocation = this._splitBudget(fpBudget, quotaMinAderente, quotaDatorePotenziale, fpPlan.firstEmployment);
        const pacCapacity = this._splitBudget(pacBudget, quotaMinAderente, quotaDatorePotenziale, pacPlan.firstEmployment);
        const recommendedCapacity = this._splitBudget(
          recommendedBudget,
          quotaMinAderente,
          quotaDatorePotenziale,
          recommendedPlan.firstEmployment
        );
        const recommendedAllocation = this._optimizeRecommendedAllocation({
          budget: recommendedBudget,
          quotaMinAderente,
          quotaDatorePotenziale,
          firstEmployment: recommendedPlan.firstEmployment,
          reddito: redditoFiscaleAnno,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          quotaMinAderente,
          modalitaVersamentoFp,
          rFP,
          rPAC,
          anniResidui,
          tassazioneFP
        });

        const risparmioFpAnno = this._calculateTaxSavings(
          redditoFiscaleAnno,
          fpAllocation.quotaDeducibile,
          fpAllocation.quotaDatore,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          quotaMinAderente,
          modalitaVersamentoFp,
          this._getTotalDeductionLimit(fpPlan.firstEmployment)
        );
        const risparmioRecommendedAnno = recommendedAllocation.risparmio;

        this._applyYearGrowth(fpPlan, {
          fpContributo: fpAllocation.quotaDeducibile + fpAllocation.quotaDatore,
          pacContributo: fpAllocation.quotaExtraPac,
          risparmioAnno: risparmioFpAnno,
          rFP,
          rPAC,
          reinvestiRisparmio
        });
        this._consumeFirstEmploymentAllowance(
          fpPlan.firstEmployment,
          fpAllocation.quotaDeducibile,
          fpAllocation.quotaDatore
        );

        this._applyYearGrowth(pacPlan, {
          fpContributo: 0,
          pacContributo: pacBudget,
          risparmioAnno: 0,
          rFP,
          rPAC,
          reinvestiRisparmio
        });
        this._consumeFirstEmploymentAllowance(pacPlan.firstEmployment, 0, 0);

        this._applyYearGrowth(recommendedPlan, {
          fpContributo: recommendedAllocation.quotaFp + recommendedAllocation.quotaDatore,
          pacContributo: recommendedAllocation.quotaPac,
          risparmioAnno: risparmioRecommendedAnno,
          rFP,
          rPAC,
          reinvestiRisparmio
        });
        this._consumeFirstEmploymentAllowance(
          recommendedPlan.firstEmployment,
          recommendedAllocation.quotaFp,
          recommendedAllocation.quotaDatore
        );

        const exitFP = this._calculateStrategyExit(fpPlan, tassazioneFP, reinvestiRisparmio);
        const exitPAC = this._calculateStrategyExit(pacPlan, tassazioneFP, reinvestiRisparmio);
        const exitRecommended = this._calculateStrategyExit(recommendedPlan, tassazioneFP, reinvestiRisparmio);

        optimizedResults.push(this._createResultRow({
          anno,
          quotaEntroMinAnno: Math.min(recommendedCapacity.quotaDeducibile, quotaMinAderente),
          quotaExtraMinAnno: Math.max(recommendedCapacity.quotaDeducibile - quotaMinAderente, 0),
          quotaEntroDedAnno: recommendedCapacity.quotaDeducibile,
          quotaExtraDedAnno: recommendedCapacity.quotaExtraPac,
          aderenteAnno: recommendedBudget,
          datoreAnno: recommendedAllocation.quotaDatore,
          risparmioAnnoEffettivo: risparmioRecommendedAnno,
          quotaFpConsigliataAnno: recommendedAllocation.quotaFp,
          quotaPacConsigliataAnno: recommendedAllocation.quotaPac,
          quotaBustaAnno: recommendedAllocation.quotaBusta,
          quotaBonificoAnno: recommendedAllocation.quotaBonifico,
          sceltaAnno: recommendedAllocation.scelta,
          exitFP,
          exitPAC,
          exitMix: exitRecommended
        }));

        fpStrategyResults.push(this._createResultRow({
          anno,
          quotaEntroMinAnno: Math.min(fpAllocation.quotaDeducibile, quotaMinAderente),
          quotaExtraMinAnno: Math.max(fpAllocation.quotaDeducibile - quotaMinAderente, 0),
          quotaEntroDedAnno: fpAllocation.quotaDeducibile,
          quotaExtraDedAnno: fpAllocation.quotaExtraPac,
          aderenteAnno: fpBudget,
          datoreAnno: fpAllocation.quotaDatore,
          risparmioAnnoEffettivo: risparmioFpAnno,
          quotaFpConsigliataAnno: fpAllocation.quotaDeducibile,
          quotaPacConsigliataAnno: fpAllocation.quotaExtraPac,
          quotaBustaAnno: this._splitFpPayment(fpAllocation.quotaDeducibile, quotaMinAderente, modalitaVersamentoFp).quotaBusta,
          quotaBonificoAnno: this._splitFpPayment(fpAllocation.quotaDeducibile, quotaMinAderente, modalitaVersamentoFp).quotaBonifico,
          sceltaAnno: fpAllocation.quotaExtraPac > 0 ? 'MIX' : 'FP',
          exitFP,
          exitPAC,
          exitMix: exitFP
        }));

        pacStrategyResults.push(this._createResultRow({
          anno,
          quotaEntroMinAnno: Math.min(pacCapacity.quotaDeducibile, quotaMinAderente),
          quotaExtraMinAnno: Math.max(pacCapacity.quotaDeducibile - quotaMinAderente, 0),
          quotaEntroDedAnno: pacCapacity.quotaDeducibile,
          quotaExtraDedAnno: pacCapacity.quotaExtraPac,
          aderenteAnno: pacBudget,
          datoreAnno: 0,
          risparmioAnnoEffettivo: 0,
          quotaFpConsigliataAnno: 0,
          quotaPacConsigliataAnno: pacBudget,
          quotaBustaAnno: 0,
          quotaBonificoAnno: 0,
          sceltaAnno: 'PAC',
          exitFP,
          exitPAC,
          exitMix: exitPAC
        }));
      }

      const finalOptimized = optimizedResults.at(-1)['Exit Mix'];
      const finalFp = optimizedResults.at(-1)['Exit FP'];
      const finalPac = optimizedResults.at(-1)['Exit PAC'];
      const selectedStrategy = [
        { results: optimizedResults, plan: recommendedPlan, exit: finalOptimized },
        { results: fpStrategyResults, plan: fpPlan, exit: finalFp },
        { results: pacStrategyResults, plan: pacPlan, exit: finalPac }
      ].reduce((best, current) => current.exit > best.exit ? current : best);
      const results = selectedStrategy.results;
      const breakeven = this._calculateFirstFullFpYear(results);

      return {
        results,
        breakeven,
        risparmioImposta: Math.round(selectedStrategy.plan.risparmioAccumulato),
        quotaDatoreFp: this._getInitialEmployerContribution({
          reddito,
          investimento,
          quotaDatoreFpPerc,
          contributoDatoreFisso,
          quotaMinAderentePerc,
          baseContributivaFpTipo,
          baseContributivaFp,
          baseDatoreFpTipo,
          baseDatoreFp
        })
      };
    }

    _calculateNetSacrificeResults(config) {
      const {
        durata, reddito, premiStraordinari = 0, investimento,
        quotaDatoreFpPerc, contributoDatoreFisso = 0, quotaMinAderentePerc,
        rendimentoAnnualeFpPerc, rendimentoAnnualePacPerc,
        modalitaCumulativa, riscattoAnticipato,
        anzianitaPregressaFp = 0,
        contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
        massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
        sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
        aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO,
        addizionaliPerc = 0, ulterioriDetrazioni = 0,
        primaOccupazionePost2006 = false,
        plafondExtraPrimaOccupazione = 0,
        anniResiduiMaggiorazione = FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNI,
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
        modalitaVersamentoFp = 'quotaMinimaBusta'
      } = config;

      const optimizedResults = [];
      const fpStrategyResults = [];
      const pacStrategyResults = [];
      const rFP = rendimentoAnnualeFpPerc;
      const rPAC = rendimentoAnnualePacPerc;
      const firstEmploymentConfig = {
        enabled: primaOccupazionePost2006,
        extraRemaining: plafondExtraPrimaOccupazione,
        yearsRemaining: anniResiduiMaggiorazione
      };

      const fpPlan = this._createStrategyState(firstEmploymentConfig);
      const pacPlan = this._createStrategyState(firstEmploymentConfig);
      const recommendedPlan = this._createStrategyState(firstEmploymentConfig);

      for (let anno = 1; anno <= durata; anno++) {
        const redditoAnno = this._applyPeriodicVariation(
          reddito,
          anno,
          variazioneRedditoTipo,
          variazioneRedditoFrequenza,
          variazioneRedditoValore
        );
        const redditoFiscaleAnno = redditoAnno + Math.max(premiStraordinari, 0);
        const investimentoAnno = this._applyPeriodicVariation(
          investimento,
          anno,
          variazioneInvestimentoTipo,
          variazioneInvestimentoFrequenza,
          variazioneInvestimentoValore
        );
        const baseContributivaAnno = this._resolveContributionBase({
          redditoAnno,
          anno,
          baseContributivaFpTipo,
          baseContributivaFp,
          variazioneBaseContributivaTipo,
          variazioneBaseContributivaFrequenza,
          variazioneBaseContributivaValore
        });
        const baseDatoreAnno = this._resolveEmployerContributionBase({
          redditoAnno,
          anno,
          baseQuotaAnno: baseContributivaAnno,
          baseDatoreFpTipo,
          baseDatoreFp,
          variazioneBaseContributivaTipo,
          variazioneBaseContributivaFrequenza,
          variazioneBaseContributivaValore
        });
        const quotaMinAderente = baseContributivaAnno * quotaMinAderentePerc;
        const quotaDatorePotenziale = this._calculateEmployerContribution(baseDatoreAnno, quotaDatoreFpPerc, contributoDatoreFisso);
        const grossReferenceBudget = modalitaCumulativa || anno === 1 ? investimentoAnno : 0;
        const tassazioneFP = this.calcolaTassazioneFp(anzianitaPregressaFp + anno - 1, riscattoAnticipato);
        const anniResidui = durata - anno + 1;

        const fpAllocation = this._splitBudget(
          grossReferenceBudget,
          quotaMinAderente,
          quotaDatorePotenziale,
          fpPlan.firstEmployment
        );
        const risparmioFpAnno = this._calculateTaxSavings(
          redditoFiscaleAnno,
          fpAllocation.quotaDeducibile,
          fpAllocation.quotaDatore,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          quotaMinAderente,
          modalitaVersamentoFp,
          this._getTotalDeductionLimit(fpPlan.firstEmployment)
        );
        const netSacrificeBudget = Math.max(grossReferenceBudget - risparmioFpAnno, 0);
        const recommendedAllocation = this._optimizeNetSacrificeAllocation({
          netBudget: netSacrificeBudget,
          grossReferenceBudget,
          quotaMinAderente,
          quotaDatorePotenziale,
          firstEmployment: recommendedPlan.firstEmployment,
          reddito: redditoFiscaleAnno,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          quotaMinAderente,
          modalitaVersamentoFp,
          rFP,
          rPAC,
          anniResidui,
          tassazioneFP
        });

        this._applyYearGrowth(fpPlan, {
          fpContributo: fpAllocation.quotaDeducibile + fpAllocation.quotaDatore,
          pacContributo: fpAllocation.quotaExtraPac,
          risparmioAnno: risparmioFpAnno,
          rFP,
          rPAC,
          reinvestiRisparmio: false
        });
        this._consumeFirstEmploymentAllowance(
          fpPlan.firstEmployment,
          fpAllocation.quotaDeducibile,
          fpAllocation.quotaDatore
        );

        this._applyYearGrowth(pacPlan, {
          fpContributo: 0,
          pacContributo: netSacrificeBudget,
          risparmioAnno: 0,
          rFP,
          rPAC,
          reinvestiRisparmio: false
        });
        this._consumeFirstEmploymentAllowance(pacPlan.firstEmployment, 0, 0);

        this._applyYearGrowth(recommendedPlan, {
          fpContributo: recommendedAllocation.quotaFp + recommendedAllocation.quotaDatore,
          pacContributo: recommendedAllocation.quotaPac,
          risparmioAnno: recommendedAllocation.risparmio,
          rFP,
          rPAC,
          reinvestiRisparmio: false
        });
        this._consumeFirstEmploymentAllowance(
          recommendedPlan.firstEmployment,
          recommendedAllocation.quotaFp,
          recommendedAllocation.quotaDatore
        );

        const exitFP = this._calculateStrategyExit(fpPlan, tassazioneFP, false, false);
        const exitPAC = this._calculateStrategyExit(pacPlan, tassazioneFP, false, false);
        const exitRecommended = this._calculateStrategyExit(recommendedPlan, tassazioneFP, false, false);

        optimizedResults.push(this._createResultRow({
          anno,
          quotaEntroMinAnno: Math.min(recommendedAllocation.quotaFp, quotaMinAderente),
          quotaExtraMinAnno: Math.max(recommendedAllocation.quotaFp - quotaMinAderente, 0),
          quotaEntroDedAnno: recommendedAllocation.quotaFp,
          quotaExtraDedAnno: recommendedAllocation.quotaPac,
          aderenteAnno: recommendedAllocation.quotaFp + recommendedAllocation.quotaPac,
          datoreAnno: recommendedAllocation.quotaDatore,
          risparmioAnnoEffettivo: recommendedAllocation.risparmio,
          quotaFpConsigliataAnno: recommendedAllocation.quotaFp,
          quotaPacConsigliataAnno: recommendedAllocation.quotaPac,
          quotaBustaAnno: recommendedAllocation.quotaBusta,
          quotaBonificoAnno: recommendedAllocation.quotaBonifico,
          sceltaAnno: recommendedAllocation.scelta,
          exitFP,
          exitPAC,
          exitMix: exitRecommended
        }));

        fpStrategyResults.push(this._createResultRow({
          anno,
          quotaEntroMinAnno: Math.min(fpAllocation.quotaDeducibile, quotaMinAderente),
          quotaExtraMinAnno: Math.max(fpAllocation.quotaDeducibile - quotaMinAderente, 0),
          quotaEntroDedAnno: fpAllocation.quotaDeducibile,
          quotaExtraDedAnno: fpAllocation.quotaExtraPac,
          aderenteAnno: grossReferenceBudget,
          datoreAnno: fpAllocation.quotaDatore,
          risparmioAnnoEffettivo: risparmioFpAnno,
          quotaFpConsigliataAnno: fpAllocation.quotaDeducibile,
          quotaPacConsigliataAnno: fpAllocation.quotaExtraPac,
          quotaBustaAnno: this._splitFpPayment(fpAllocation.quotaDeducibile, quotaMinAderente, modalitaVersamentoFp).quotaBusta,
          quotaBonificoAnno: this._splitFpPayment(fpAllocation.quotaDeducibile, quotaMinAderente, modalitaVersamentoFp).quotaBonifico,
          sceltaAnno: fpAllocation.quotaExtraPac > 0 ? 'MIX' : 'FP',
          exitFP,
          exitPAC,
          exitMix: exitFP
        }));

        pacStrategyResults.push(this._createResultRow({
          anno,
          quotaEntroMinAnno: 0,
          quotaExtraMinAnno: 0,
          quotaEntroDedAnno: 0,
          quotaExtraDedAnno: netSacrificeBudget,
          aderenteAnno: netSacrificeBudget,
          datoreAnno: 0,
          risparmioAnnoEffettivo: 0,
          quotaFpConsigliataAnno: 0,
          quotaPacConsigliataAnno: netSacrificeBudget,
          quotaBustaAnno: 0,
          quotaBonificoAnno: 0,
          sceltaAnno: 'PAC',
          exitFP,
          exitPAC,
          exitMix: exitPAC
        }));
      }

      const finalOptimized = optimizedResults.at(-1)['Exit Mix'];
      const finalFp = optimizedResults.at(-1)['Exit FP'];
      const finalPac = optimizedResults.at(-1)['Exit PAC'];
      const selectedStrategy = [
        { results: optimizedResults, plan: recommendedPlan, exit: finalOptimized },
        { results: fpStrategyResults, plan: fpPlan, exit: finalFp },
        { results: pacStrategyResults, plan: pacPlan, exit: finalPac }
      ].reduce((best, current) => current.exit > best.exit ? current : best);
      const results = selectedStrategy.results;

      return {
        results,
        breakeven: this._calculateFirstFullFpYear(results),
        risparmioImposta: Math.round(selectedStrategy.plan.risparmioAccumulato),
        quotaDatoreFp: this._getInitialEmployerContribution({
          reddito,
          investimento,
          quotaDatoreFpPerc,
          contributoDatoreFisso,
          quotaMinAderentePerc,
          baseContributivaFpTipo,
          baseContributivaFp,
          baseDatoreFpTipo,
          baseDatoreFp
        })
      };
    }

    _createStrategyState(firstEmploymentConfig = {}) {
      return {
        montanteFP: 0,
        contributiFP: 0,
        montantePAC: 0,
        investimentoPAC: 0,
        risparmioAccumulato: 0,
        risparmioDaReinvestire: 0,
        firstEmployment: this._createFirstEmploymentState(firstEmploymentConfig)
      };
    }

    _applyPeriodicVariation(baseValue, year, type = 'percentuale', frequency = 0, value = 0) {
      const safeBase = Math.max(baseValue, 0);
      const safeFrequency = Math.floor(frequency);
      const safeValue = Number.isFinite(value) ? value : 0;

      if (safeFrequency <= 0 || safeValue === 0 || year <= 1) {
        return safeBase;
      }

      const increments = Math.floor((year - 1) / safeFrequency);
      if (increments <= 0) {
        return safeBase;
      }

      if (type === 'euro') {
        return Math.max(safeBase + (safeValue * increments), 0);
      }

      return Math.max(safeBase * Math.pow(1 + safeValue / 100, increments), 0);
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
      if (baseContributivaFpTipo === 'ral' || baseContributivaFp <= 0) {
        return Math.max(redditoAnno, 0);
      }

      const baseAlternativa = this._applyPeriodicVariation(
        baseContributivaFp,
        anno,
        variazioneBaseContributivaTipo,
        variazioneBaseContributivaFrequenza,
        variazioneBaseContributivaValore
      );
      return Math.min(baseAlternativa, Math.max(redditoAnno, 0));
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
      if (baseDatoreFpTipo === 'same') {
        return Math.max(baseQuotaAnno, 0);
      }

      return this._resolveContributionBase({
        redditoAnno,
        anno,
        baseContributivaFpTipo: baseDatoreFpTipo,
        baseContributivaFp: baseDatoreFp,
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
      const baseContributiva = this._resolveContributionBase({
        redditoAnno: reddito,
        anno: 1,
        baseContributivaFpTipo,
        baseContributivaFp
      });
      const baseDatore = this._resolveEmployerContributionBase({
        redditoAnno: reddito,
        anno: 1,
        baseQuotaAnno: baseContributiva,
        baseDatoreFpTipo,
        baseDatoreFp
      });
      const quotaMinAderente = baseContributiva * quotaMinAderentePerc;
      const quotaDatorePotenziale = this._calculateEmployerContribution(
        baseDatore,
        quotaDatoreFpPerc,
        contributoDatoreFisso
      );
      return investimento >= quotaMinAderente ? Math.round(quotaDatorePotenziale) : 0;
    }

    _calculateEmployerContribution(baseContributiva, quotaDatoreFpPerc, contributoDatoreFisso = 0) {
      return Math.max(baseContributiva * quotaDatoreFpPerc, 0) + Math.max(contributoDatoreFisso, 0);
    }

    _createFirstEmploymentState({ enabled = false, extraRemaining = 0, yearsRemaining = 0 } = {}) {
      return {
        enabled: Boolean(enabled),
        extraRemaining: Math.max(extraRemaining, 0),
        yearsRemaining: Math.max(Math.floor(yearsRemaining), 0)
      };
    }

    _getTotalDeductionLimit(firstEmployment = {}) {
      const ordinaryLimit = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP;
      if (!firstEmployment.enabled || firstEmployment.yearsRemaining <= 0 || firstEmployment.extraRemaining <= 0) {
        return ordinaryLimit;
      }

      return ordinaryLimit + Math.min(
        firstEmployment.extraRemaining,
        FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNUA
      );
    }

    _getAvailableDeductionLimit(firstEmployment, quotaDatore = 0) {
      return Math.max(this._getTotalDeductionLimit(firstEmployment) - quotaDatore, 0);
    }

    _consumeFirstEmploymentAllowance(firstEmployment, quotaFp, quotaDatore) {
      if (!firstEmployment.enabled || firstEmployment.yearsRemaining <= 0) return;

      const extraUsed = Math.min(
        Math.max(quotaFp + quotaDatore - FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP, 0),
        FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNUA,
        firstEmployment.extraRemaining
      );

      firstEmployment.extraRemaining = Math.max(firstEmployment.extraRemaining - extraUsed, 0);
      firstEmployment.yearsRemaining = Math.max(firstEmployment.yearsRemaining - 1, 0);
    }

    _splitBudget(budget, quotaMinAderente, quotaDatorePotenziale, firstEmployment) {
      if (budget <= 0) {
        return { quotaDeducibile: 0, quotaExtraPac: 0, quotaDatore: 0 };
      }

      const quotaDatore = budget >= quotaMinAderente ? quotaDatorePotenziale : 0;
      const limiteDeduzione = this._getAvailableDeductionLimit(firstEmployment, quotaDatore);
      const quotaDeducibile = Math.min(budget, limiteDeduzione);

      return {
        quotaDeducibile,
        quotaExtraPac: Math.max(budget - quotaDeducibile, 0),
        quotaDatore: quotaDeducibile >= quotaMinAderente ? quotaDatore : 0
      };
    }

    _optimizeRecommendedAllocation({
      budget,
      quotaMinAderente,
      quotaDatorePotenziale,
      firstEmployment,
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
      anniResidui,
      tassazioneFP
    }) {
      if (budget <= 0) {
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
      const maxWithoutEmployer = Math.min(budget, this._getAvailableDeductionLimit(firstEmployment, 0));
      const maxWithEmployer = Math.min(
        budget,
        this._getAvailableDeductionLimit(firstEmployment, quotaDatorePotenziale)
      );

      for (let amount = 0; amount <= Math.floor(maxWithoutEmployer); amount++) {
        candidates.add(amount);
      }
      candidates.add(maxWithoutEmployer);
      candidates.add(maxWithEmployer);
      candidates.add(Math.min(quotaMinAderente, budget));

      let best = null;

      for (const candidate of candidates) {
        const quotaFp = Math.max(candidate, 0);
        const quotaDatore = quotaFp >= quotaMinAderente ? quotaDatorePotenziale : 0;
        const limiteDeduzione = this._getAvailableDeductionLimit(firstEmployment, quotaDatore);

        if (quotaFp > budget || quotaFp > limiteDeduzione) continue;

        const quotaPac = budget - quotaFp;
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
            this._getTotalDeductionLimit(firstEmployment)
          )
          : 0;
        const fpContributo = quotaFp + quotaDatore;
        const fpMontante = fpContributo * Math.pow(1 + rFP, anniResidui);
        const fpNetto = fpMontante - (fpContributo * tassazioneFP) + risparmio;
        const pacMontante = this._projectPacContribution(quotaPac, rPAC, anniResidui);
        const pacNetto = this._calculatePacExit(pacMontante, quotaPac);
        const totaleNetto = fpNetto + pacNetto;

        if (!best || totaleNetto > best.totaleNetto) {
          const splitVersamento = this._splitFpPayment(quotaFp, quotaMinAderente, modalitaVersamentoFp);
          best = { quotaFp, quotaPac, quotaDatore, risparmio, totaleNetto, ...splitVersamento };
        }
      }

      const scelta = best.quotaFp <= 0
        ? 'PAC'
        : best.quotaPac <= 0
          ? 'FP'
          : 'MIX';

      return { ...best, scelta };
    }

    _optimizeNetSacrificeAllocation({
      netBudget,
      grossReferenceBudget,
      quotaMinAderente,
      quotaDatorePotenziale,
      firstEmployment,
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
      anniResidui,
      tassazioneFP
    }) {
      if (grossReferenceBudget <= 0) {
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
      const maxWithoutEmployer = Math.min(grossReferenceBudget, this._getAvailableDeductionLimit(firstEmployment, 0));
      const maxWithEmployer = Math.min(
        grossReferenceBudget,
        this._getAvailableDeductionLimit(firstEmployment, quotaDatorePotenziale)
      );

      for (let amount = 0; amount <= Math.floor(maxWithoutEmployer); amount++) {
        candidates.add(amount);
      }
      candidates.add(maxWithoutEmployer);
      candidates.add(maxWithEmployer);
      candidates.add(Math.min(quotaMinAderente, grossReferenceBudget));

      let best = null;

      for (const candidate of candidates) {
        const quotaFp = Math.max(candidate, 0);
        const quotaDatore = quotaFp >= quotaMinAderente ? quotaDatorePotenziale : 0;
        const limiteDeduzione = this._getAvailableDeductionLimit(firstEmployment, quotaDatore);

        if (quotaFp > grossReferenceBudget || quotaFp > limiteDeduzione) continue;

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
            this._getTotalDeductionLimit(firstEmployment)
          )
          : 0;
        const quotaPac = netBudget - quotaFp + risparmio;

        if (quotaPac < -0.01) continue;

        const quotaPacNormalizzata = Math.max(quotaPac, 0);
        const fpContributo = quotaFp + quotaDatore;
        const fpMontante = fpContributo * Math.pow(1 + rFP, anniResidui);
        const fpNetto = fpMontante - (fpContributo * tassazioneFP);
        const pacMontante = this._projectPacContribution(quotaPacNormalizzata, rPAC, anniResidui);
        const pacNetto = this._calculatePacExit(pacMontante, quotaPacNormalizzata);
        const totaleNetto = fpNetto + pacNetto;

        if (!best || totaleNetto > best.totaleNetto) {
          best = {
            quotaFp,
            quotaPac: quotaPacNormalizzata,
            quotaDatore,
            risparmio,
            totaleNetto,
            ...this._splitFpPayment(quotaFp, quotaMinAderente, modalitaVersamentoFp)
          };
        }
      }

      if (!best) {
        best = {
          quotaFp: 0,
          quotaPac: netBudget,
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
      reinvestiRisparmio
    }) {
      state.montanteFP = (state.montanteFP + fpContributo) * (1 + rFP);
      state.contributiFP += fpContributo;
      state.montantePAC = this._applyPacAnnualGrowth(state.montantePAC, pacContributo, rPAC);
      state.investimentoPAC += pacContributo;
      state.risparmioAccumulato += risparmioAnno;
      state.risparmioDaReinvestire = reinvestiRisparmio ? risparmioAnno : 0;
    }

    _applyPacAnnualGrowth(montante, contributo, rendimento) {
      const lordo = (montante + contributo) * (1 + rendimento);
      return Math.max(lordo * (1 - FINANCIAL_CONSTANTS.IMPOSTA_BOLLO_PAC), 0);
    }

    _projectPacContribution(contributo, rendimento, anni) {
      let montante = 0;
      for (let i = 0; i < anni; i++) {
        montante = this._applyPacAnnualGrowth(montante, i === 0 ? contributo : 0, rendimento);
      }
      return montante;
    }

    _calculateStrategyExit(state, tassazioneFP, reinvestiRisparmio, includeTaxSavings = true) {
      const exitFP = this._calculateFpExit({
        montante: state.montanteFP,
        contributi: state.contributiFP,
        tassazione: tassazioneFP,
        risparmioAnno: includeTaxSavings ? state.risparmioDaReinvestire : 0,
        risparmioAccumulato: includeTaxSavings ? state.risparmioAccumulato : 0,
        reinvestiRisparmio
      });
      const exitPAC = this._calculatePacExit(state.montantePAC, state.investimentoPAC);

      return exitFP + exitPAC;
    }

    /**
     * Calcola il netto di uscita per la componente Fondo Pensione.
     * La tassazione 15-9% si applica solo ai contributi, non ai rendimenti
     * gia considerati netti nel rendimento FP.
     */
    _calculateFpExit({
      montante,
      contributi,
      tassazione,
      risparmioAnno,
      risparmioAccumulato,
      reinvestiRisparmio
    }) {
      const risparmioDaAggiungere = reinvestiRisparmio ? risparmioAnno : risparmioAccumulato;
      return montante - (contributi * tassazione) + risparmioDaAggiungere;
    }

    /**
     * Calcola il netto PAC tassando solo le plusvalenze.
     */
    _calculatePacExit(montante, investimentoTotale) {
      const plusvalenza = Math.max(montante - investimentoTotale, 0);
      return montante - (plusvalenza * FINANCIAL_CONSTANTS.TASSAZIONE_RENDITE_PAC);
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
      sceltaAnno,
      exitFP,
      exitPAC,
      exitMix
    }) {
      return {
        "Anno": anno,
        "Entro Min": Math.round(quotaEntroMinAnno),
        "Extra Min": Math.round(quotaExtraMinAnno),
        "Entro Ded": Math.round(quotaEntroDedAnno),
        "Extra Ded": Math.round(quotaExtraDedAnno),
        "Aderente": Math.round(aderenteAnno),
        "Datore": Math.round(datoreAnno),
        "Risparmio": Math.round(risparmioAnnoEffettivo),
        "FP Cons": Math.round(quotaFpConsigliataAnno),
        "PAC Cons": Math.round(quotaPacConsigliataAnno),
        "FP Busta": Math.round(quotaBustaAnno),
        "FP Bonifico": Math.round(quotaBonificoAnno),
        "Scelta": sceltaAnno,
        "Exit FP": Math.round(exitFP),
        "Exit PAC": Math.round(exitPAC),
        "Exit Mix": Math.round(exitMix),
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
        if (results[i]['Entro Ded'] > 0 && results[i]['FP Cons'] >= results[i]['Entro Ded']) {
          return results[i]['Anno'];
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
      limiteDeduzioneTotale = FINANCIAL_CONSTANTS.LIMITE_DEDUZIONE_FP
    ) {
      const redditoImponibile = this._calculateIrpefTaxableIncome({
        reddito,
        contributiInpsPerc,
        massimaleContributivoInps,
        sogliaIvsAggiuntivo,
        aliquotaIvsAggiuntivaPerc
      });
      const limiteDeduzione = Math.max(limiteDeduzioneTotale - quotaDatoreFp, 0);

      // La deduzione è il minimo tra investimento e limite di deduzione
      const deduzione = Math.min(investimento, limiteDeduzione);
      const quotaBusta = Math.min(
        this._splitFpPayment(investimento, quotaMinAderente, modalitaVersamentoFp).quotaBusta,
        deduzione
      );

      const redditoComplessivoCuneo = redditoImponibile;
      const redditoComplessivoCuneoDedotto = Math.max(redditoComplessivoCuneo - quotaBusta, 0);
      const bonusCuneo = this._calculateBonusCuneoFiscale(redditoComplessivoCuneo);
      const bonusCuneoDedotto = this._calculateBonusCuneoFiscale(redditoComplessivoCuneoDedotto);

      // Calcola l'imposta senza deduzione
      const impostaLorda = this.calcolaImposta(redditoImponibile);
      const addizionali = redditoImponibile * addizionaliPerc;
      const detrazione = this.calcolaDetrazioniDipendente(redditoImponibile);
      const trattamentoIntegrativo = this._calculateTrattamentoIntegrativo(
        redditoImponibile,
        impostaLorda,
        detrazione,
        ulterioriDetrazioni
      );
      const impostaNetta = Math.max(impostaLorda + addizionali - detrazione - ulterioriDetrazioni, 0);
      const costoFiscaleNetto = impostaNetta - trattamentoIntegrativo - bonusCuneo;

      // Calcola l'imposta con deduzione
      const redditoDedotto = Math.max(redditoImponibile - deduzione, 0);
      const redditoDetrazioniDedotto = Math.max(redditoImponibile - quotaBusta, 0);
      const impostaLordaDedotta = this.calcolaImposta(redditoDedotto);
      const addizionaliDedotte = redditoDedotto * addizionaliPerc;
      const detrazioneDedotta = this.calcolaDetrazioniDipendente(redditoDetrazioniDedotto);
      const trattamentoIntegrativoDedotto = this._calculateTrattamentoIntegrativo(
        redditoDetrazioniDedotto,
        this.calcolaImposta(redditoDetrazioniDedotto),
        detrazioneDedotta,
        ulterioriDetrazioni
      );
      const impostaNettaDedotta = Math.max(impostaLordaDedotta + addizionaliDedotte - detrazioneDedotta - ulterioriDetrazioni, 0);
      const costoFiscaleNettoDedotto = impostaNettaDedotta - trattamentoIntegrativoDedotto - bonusCuneoDedotto;

      // Risparmio fiscale
      return costoFiscaleNetto - costoFiscaleNettoDedotto;
    }

    _splitFpPayment(quotaFp, quotaMinAderente = 0, modalitaVersamentoFp = 'quotaMinimaBusta') {
      const safeQuotaFp = Math.max(quotaFp, 0);
      if (modalitaVersamentoFp === 'tuttoBusta') {
        return { quotaBusta: safeQuotaFp, quotaBonifico: 0 };
      }
      if (modalitaVersamentoFp === 'tuttoBonifico') {
        return { quotaBusta: 0, quotaBonifico: safeQuotaFp };
      }

      const quotaBusta = Math.min(safeQuotaFp, Math.max(quotaMinAderente, 0));
      return {
        quotaBusta,
        quotaBonifico: Math.max(safeQuotaFp - quotaBusta, 0)
      };
    }

    _calculateTrattamentoIntegrativo(reddito, impostaLorda = 0, detrazioniLavoro = 0, ulterioriDetrazioni = 0) {
      const safeReddito = Math.max(reddito, 0);
      const importo = FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_IMPORTO;

      if (
        safeReddito <= FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_PIENA &&
        impostaLorda > detrazioniLavoro
      ) {
        return importo;
      }

      if (
        safeReddito > FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_PIENA &&
        safeReddito <= FINANCIAL_CONSTANTS.TRATTAMENTO_INTEGRATIVO_SOGLIA_MAX
      ) {
        const incapienzaDetrazioni = detrazioniLavoro + Math.max(ulterioriDetrazioni, 0) - impostaLorda;
        return Math.max(Math.min(importo, incapienzaDetrazioni), 0);
      }

      return 0;
    }

    _calculateBonusCuneoFiscale(redditoComplessivo) {
      const reddito = Math.max(redditoComplessivo, 0);

      if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_1) {
        return reddito * FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_1;
      }
      if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_2) {
        return reddito * FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_2;
      }
      if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_3) {
        return reddito * FINANCIAL_CONSTANTS.BONUS_CUNEO_ALIQUOTA_3;
      }
      if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_4) {
        return FINANCIAL_CONSTANTS.BONUS_CUNEO_DETRAZIONE_PIENA;
      }
      if (reddito <= FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5) {
        return FINANCIAL_CONSTANTS.BONUS_CUNEO_DETRAZIONE_PIENA *
          (FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5 - reddito) /
          (FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_5 - FINANCIAL_CONSTANTS.BONUS_CUNEO_SOGLIA_4);
      }

      return 0;
    }

    _calculateIrpefTaxableIncome({
      reddito,
      contributiInpsPerc = FINANCIAL_CONSTANTS.CONTRIBUTI_INPS_DEFAULT,
      massimaleContributivoInps = FINANCIAL_CONSTANTS.MASSIMALE_CONTRIBUTIVO_INPS,
      sogliaIvsAggiuntivo = FINANCIAL_CONSTANTS.SOGLIA_IVS_AGGIUNTIVO,
      aliquotaIvsAggiuntivaPerc = FINANCIAL_CONSTANTS.ALIQUOTA_IVS_AGGIUNTIVO
    }) {
      const safeReddito = Math.max(reddito, 0);
      const massimale = massimaleContributivoInps > 0 ? massimaleContributivoInps : safeReddito;
      const baseContributivaInps = Math.min(safeReddito, massimale);
      const contributiOrdinari = baseContributivaInps * this._clamp(contributiInpsPerc, 0, 1);
      const baseIvsAggiuntiva = Math.max(baseContributivaInps - Math.max(sogliaIvsAggiuntivo, 0), 0);
      const contributoIvsAggiuntivo = baseIvsAggiuntiva * this._clamp(aliquotaIvsAggiuntivaPerc, 0, 1);

      return Math.max(safeReddito - contributiOrdinari - contributoIvsAggiuntivo, 0);
    }

    _clamp(value, min, max) {
      if (!Number.isFinite(value)) return min;
      return Math.min(Math.max(value, min), max);
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
     * Calcola l'imposta sul reddito in base agli scaglioni progressivi IRPEF 2025.
     * Aggiornato alla Legge 30 dicembre 2024, n. 207.
     * @param {number} reddito - Importo del reddito
     * @returns {number} Importo dell'imposta
     */
    calcolaImposta(reddito) {
      let imposta;
      if (reddito <= 28000) {
        imposta = reddito * 0.23;
      } else if (reddito <= 50000) {
        imposta = 28000 * 0.23 + (reddito - 28000) * 0.35;
      } else {
        imposta = 28000 * 0.23 + 22000 * 0.35 + (reddito - 50000) * 0.43;
      }
      return imposta;
    }

    /**
     * Calcola le detrazioni per lavoro dipendente in base al reddito.
     * Aggiornato alla Legge 30 dicembre 2024, n. 207.
     * @param {number} reddito - Importo del reddito
     * @returns {number} Importo della detrazione
     */
    calcolaDetrazioniDipendente(reddito) {
      let detrazione;

      if (reddito <= 15000) {
        detrazione = 1955;
      } else if (reddito <= 28000) {
        const rapporto = (28000 - reddito) / 13000;
        detrazione = 1910 + (1190 * rapporto);
      } else if (reddito <= 50000) {
        const rapporto = (50000 - reddito) / 22000;
        detrazione = 1910 * rapporto;
      } else {
        detrazione = 0;
      }

      if (reddito >= 25000 && reddito <= 35000) {
        detrazione += 65;
      }

      return detrazione;
    }

    /**
     * Converte i risultati in formato CSV
     * @param {Array} rows - Dati dei risultati
     * @returns {string} Stringa formattata CSV
     */
    convertToCSV(rows) {
      if (!rows.length) return '';

      let str = '';
      const headers = Object.keys(rows[0]).join(',');
      str += headers + '\r\n';

      for (let i = 0; i < rows.length; i++) {
        let line = '';
        for (let index in rows[i]) {
          if (line !== '') line += ',';
          line += rows[i][index];
        }
        str += line + '\r\n';
      }
      return str;
    }
  }
