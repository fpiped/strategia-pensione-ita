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
  consumeFirstEmploymentAllowance,
  createFirstEmploymentState,
  getAvailableDeductionLimit,
  getInitialEmployerContribution,
  getTotalDeductionLimit,
  resolveContributionBase,
  resolveEmployerContributionBase,
  splitBudget
} from '../calculators/pension-contributions.js';
import {
  applyPacAnnualGrowth,
  applyYearGrowth,
  calculateFpExit,
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
     * Calcola tutti gli scenari finanziari basati sui parametri di input
     * Supporta 4 combinazioni: singolo/cumulativo x reinvesti/non-reinvesti
     * @param {Object} config - Oggetto di configurazione con tutti i parametri
     * @returns {Object} Risultati e informazioni sul mix
     */
    calculateResults(config) {
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
        primaOccupazionePost2006 = false,
        plafondExtraPrimaOccupazione = 0,
        anniResiduiMaggiorazione = FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNI,
        anniAttesaMaggiorazione = 0,
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

      if (modalitaConfronto === 'sacrificioNetto') {
        return this._calculateNetSacrificeResults(config);
      }

      const optimizedResults = [];
      const fpStrategyResults = [];
      const pacStrategyResults = [];
      const rFP = rendimentoAnnualeFpPerc;
      const rPAC = rendimentoAnnualePacPerc;
      const growthOptions = this._createGrowthOptions({
        rendimentoFpMode,
        costiAnnuiFpPerc,
        quotaAgevolataFpPerc,
        rendimentoPacMode,
        costiAnnuiPacPerc,
        quotaAgevolataPacPerc
      });

      const firstEmploymentConfig = {
        enabled: primaOccupazionePost2006,
        extraRemaining: plafondExtraPrimaOccupazione,
        yearsRemaining: anniResiduiMaggiorazione,
        waitYears: anniAttesaMaggiorazione
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
        const premiAnno = this._applyPeriodicVariation(
          Math.max(premiStraordinari, 0),
          anno,
          variazionePremiTipo,
          variazionePremiFrequenza,
          variazionePremiValore
        );
        const altriRedditiAnno = this._applyPeriodicVariation(
          Math.max(altriRedditi, 0),
          anno,
          variazioneAltriRedditiTipo,
          variazioneAltriRedditiFrequenza,
          variazioneAltriRedditiValore
        );
        const redditoFiscaleAnno = redditoAnno + premiAnno + altriRedditiAnno;
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
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          pacExitOptions: growthOptions.pac,
          anniResidui,
          tassazioneFP
        });

        const fpPaymentSplit = this._chooseBestPaymentSplit({
          quotaFp: fpAllocation.quotaDeducibile,
          quotaDatore: fpAllocation.quotaDatore,
          quotaMinAderente,
          modalitaVersamentoFp,
          reddito: redditoFiscaleAnno,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          limiteDeduzioneTotale: this._getTotalDeductionLimit(fpPlan.firstEmployment)
        });
        const risparmioFpAnnoEffettivo = fpPaymentSplit.risparmio;
        const risparmioRecommendedAnno = recommendedAllocation.risparmio;

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
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio
        });
        this._consumeFirstEmploymentAllowance(pacPlan.firstEmployment, 0, 0);

        this._applyYearGrowth(recommendedPlan, {
          fpContributo: recommendedAllocation.quotaFp + recommendedAllocation.quotaDatore,
          pacContributo: recommendedAllocation.quotaPac,
          risparmioAnno: risparmioRecommendedAnno,
          rFP,
          rPAC,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio
        });
        this._consumeFirstEmploymentAllowance(
          recommendedPlan.firstEmployment,
          recommendedAllocation.quotaFp,
          recommendedAllocation.quotaDatore
        );

        const exitFP = this._calculateStrategyExit(fpPlan, tassazioneFP, reinvestiRisparmio, true, growthOptions.pac);
        const exitPAC = this._calculateStrategyExit(pacPlan, tassazioneFP, reinvestiRisparmio, true, growthOptions.pac);
        const exitRecommended = this._calculateStrategyExit(recommendedPlan, tassazioneFP, reinvestiRisparmio, true, growthOptions.pac);

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
          risparmioOttimizzazioneBustaAnno: recommendedAllocation.extraRisparmioVersamento,
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
          risparmioOttimizzazioneBustaAnno: 0,
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
        // Serie complete per vista tabella/esploratore per strategia.
        strategies: {
          mix: results,
          fp: fpStrategyResults,
          pac: pacStrategyResults
        },
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
        addizionaliPerc = 0, ulterioriDetrazioni = 0,
        primaOccupazionePost2006 = false,
        plafondExtraPrimaOccupazione = 0,
        anniResiduiMaggiorazione = FINANCIAL_CONSTANTS.MAGGIORAZIONE_PRIMA_OCCUPAZIONE_ANNI,
        anniAttesaMaggiorazione = 0,
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

      const optimizedResults = [];
      const fpStrategyResults = [];
      const pacStrategyResults = [];
      const rFP = rendimentoAnnualeFpPerc;
      const rPAC = rendimentoAnnualePacPerc;
      const growthOptions = this._createGrowthOptions({
        rendimentoFpMode,
        costiAnnuiFpPerc,
        quotaAgevolataFpPerc,
        rendimentoPacMode,
        costiAnnuiPacPerc,
        quotaAgevolataPacPerc
      });
      const firstEmploymentConfig = {
        enabled: primaOccupazionePost2006,
        extraRemaining: plafondExtraPrimaOccupazione,
        yearsRemaining: anniResiduiMaggiorazione,
        waitYears: anniAttesaMaggiorazione
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
        const premiAnno = this._applyPeriodicVariation(
          Math.max(premiStraordinari, 0),
          anno,
          variazionePremiTipo,
          variazionePremiFrequenza,
          variazionePremiValore
        );
        const altriRedditiAnno = this._applyPeriodicVariation(
          Math.max(altriRedditi, 0),
          anno,
          variazioneAltriRedditiTipo,
          variazioneAltriRedditiFrequenza,
          variazioneAltriRedditiValore
        );
        const redditoFiscaleAnno = redditoAnno + premiAnno + altriRedditiAnno;
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
        const fpPaymentSplit = this._chooseBestPaymentSplit({
          quotaFp: fpAllocation.quotaDeducibile,
          quotaDatore: fpAllocation.quotaDatore,
          quotaMinAderente,
          modalitaVersamentoFp,
          reddito: redditoFiscaleAnno,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          limiteDeduzioneTotale: this._getTotalDeductionLimit(fpPlan.firstEmployment)
        });
        const risparmioFpAnnoEffettivo = fpPaymentSplit.risparmio;
        const netSacrificeBudget = Math.max(grossReferenceBudget - risparmioFpAnnoEffettivo, 0);
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
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          pacExitOptions: growthOptions.pac,
          anniResidui,
          tassazioneFP
        });

        this._applyYearGrowth(fpPlan, {
          fpContributo: fpAllocation.quotaDeducibile + fpAllocation.quotaDatore,
          pacContributo: fpAllocation.quotaExtraPac,
          risparmioAnno: risparmioFpAnnoEffettivo,
          rFP,
          rPAC,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
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
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio: false
        });
        this._consumeFirstEmploymentAllowance(pacPlan.firstEmployment, 0, 0);

        this._applyYearGrowth(recommendedPlan, {
          fpContributo: recommendedAllocation.quotaFp + recommendedAllocation.quotaDatore,
          pacContributo: recommendedAllocation.quotaPac,
          risparmioAnno: recommendedAllocation.risparmio,
          rFP,
          rPAC,
          fpGrowthOptions: growthOptions.fp,
          pacGrowthOptions: growthOptions.pac,
          reinvestiRisparmio: false
        });
        this._consumeFirstEmploymentAllowance(
          recommendedPlan.firstEmployment,
          recommendedAllocation.quotaFp,
          recommendedAllocation.quotaDatore
        );

        const exitFP = this._calculateStrategyExit(fpPlan, tassazioneFP, false, false, growthOptions.pac);
        const exitPAC = this._calculateStrategyExit(pacPlan, tassazioneFP, false, false, growthOptions.pac);
        const exitRecommended = this._calculateStrategyExit(recommendedPlan, tassazioneFP, false, false, growthOptions.pac);

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
          risparmioOttimizzazioneBustaAnno: recommendedAllocation.extraRisparmioVersamento,
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
          risparmioOttimizzazioneBustaAnno: 0,
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
        strategies: {
          mix: results,
          fp: fpStrategyResults,
          pac: pacStrategyResults
        },
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

    _createFirstEmploymentState({ enabled = false, extraRemaining = 0, yearsRemaining = 0, waitYears = 0 } = {}) {
      return createFirstEmploymentState({ enabled, extraRemaining, yearsRemaining, waitYears });
    }

    _getTotalDeductionLimit(firstEmployment = {}) {
      return getTotalDeductionLimit(firstEmployment);
    }

    _getAvailableDeductionLimit(firstEmployment, quotaDatore = 0) {
      return getAvailableDeductionLimit(firstEmployment, quotaDatore);
    }

    _consumeFirstEmploymentAllowance(firstEmployment, quotaFp, quotaDatore) {
      consumeFirstEmploymentAllowance(firstEmployment, quotaFp, quotaDatore);
    }

    _splitBudget(budget, quotaMinAderente, quotaDatorePotenziale, firstEmployment) {
      return splitBudget(budget, quotaMinAderente, quotaDatorePotenziale, firstEmployment);
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
      fpGrowthOptions = {},
      pacGrowthOptions = {},
      pacExitOptions = {},
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
          limiteDeduzioneTotale: this._getTotalDeductionLimit(firstEmployment)
        });
        const risparmio = paymentSplit.risparmio;
        const fpContributo = quotaFp + quotaDatore;
        const fpMontante = this._projectFpContribution(fpContributo, rFP, anniResidui, fpGrowthOptions);
        const fpNetto = fpMontante - (fpContributo * tassazioneFP) + risparmio;
        const pacMontante = this._projectPacContribution(quotaPac, rPAC, anniResidui, pacGrowthOptions);
        const pacNetto = this._calculatePacExit(pacMontante, quotaPac, pacExitOptions);
        const totaleNetto = fpNetto + pacNetto;

        if (!best || totaleNetto > best.totaleNetto) {
          best = { quotaFp, quotaPac, quotaDatore, risparmio, totaleNetto, ...paymentSplit };
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
      fpGrowthOptions = {},
      pacGrowthOptions = {},
      pacExitOptions = {},
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
          limiteDeduzioneTotale: this._getTotalDeductionLimit(firstEmployment)
        });
        const risparmio = paymentSplit.risparmio;
        const quotaPac = netBudget - quotaFp + risparmio;

        if (quotaPac < -0.01) continue;

        const quotaPacNormalizzata = Math.max(quotaPac, 0);
        const fpContributo = quotaFp + quotaDatore;
        const fpMontante = this._projectFpContribution(fpContributo, rFP, anniResidui, fpGrowthOptions);
        const fpNetto = fpMontante - (fpContributo * tassazioneFP);
        const pacMontante = this._projectPacContribution(quotaPacNormalizzata, rPAC, anniResidui, pacGrowthOptions);
        const pacNetto = this._calculatePacExit(pacMontante, quotaPacNormalizzata, pacExitOptions);
        const totaleNetto = fpNetto + pacNetto;

        if (!best || totaleNetto > best.totaleNetto) {
          best = {
            quotaFp,
            quotaPac: quotaPacNormalizzata,
            quotaDatore,
            risparmio,
            totaleNetto,
            ...paymentSplit
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

    _applyPacAnnualGrowth(montante, contributo, rendimento) {
      return applyPacAnnualGrowth(montante, contributo, rendimento);
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
      return calculateFpExit({
        montante,
        contributi,
        tassazione,
        risparmioAnno,
        risparmioAccumulato,
        reinvestiRisparmio
      });
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
        "Diff Busta": Math.round(risparmioOttimizzazioneBustaAnno),
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
     * Calcola l'imposta sul reddito in base agli scaglioni progressivi IRPEF 2025.
     * Aggiornato alla Legge 30 dicembre 2024, n. 207.
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
