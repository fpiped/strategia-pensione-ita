import { FINANCIAL_CONSTANTS } from '../constants/financial-constants.js';
import { CURRENT_FISCAL_RULES } from '../constants/fiscal-rules.js';
import {
  calculateBonusCuneoFiscale,
  calculateEmployeeDeduction,
  calculateHighIncomeDetrazioniCut,
  calculateIncomeTax,
  calculateIrpefTaxableIncome,
  calculateNetTaxDue,
  calculateMarginalIncomeTaxRate,
  calculateTaxComparison,
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
  calculateFpExitTaxBase,
  calculateNetAnnualReturn,
  calculatePacExitTax,
  calculatePacExit,
  calculateStrategyExit,
  createGrowthOptions,
  projectFpContribution,
  projectPacContribution
} from '../calculators/investment-growth.js';
import { calculateStrategyIrr } from '../calculators/cash-flow-return.js';

/**
 * FinancialModel - Contiene tutta la logica di business e i calcoli
 * Calcola l'evoluzione di un singolo investimento nel tempo
 */
export class FinancialModel {
    /**
     * Calcola tutti gli scenari finanziari basati sui parametri di input,
     * in entrambe le modalità di input (spesa e investimento).
     * @param {Object} config - Oggetto di configurazione con tutti i parametri
     * @returns {Object} Risultati e informazioni sul mix
     */
    calculateResults(config) {
      return this._simulateStrategies(this._normalizeConfig(config));
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
      const detrazioneLavoro = calculateEmployeeDeduction(imponibileIrpef);
      const ulterioriDetrazioni = config.ulterioriDetrazioni || 0;
      // Addizionali dovute solo se l'IRPEF netta dell'anno è positiva;
      // sopra la soglia redditi alti le detrazioni per oneri (art. 16-ter
      // TUIR) sono ridotte di 440€ — la detrazione lavoro resta intatta.
      const riduzioneDetrazioniAltiRedditi = calculateHighIncomeDetrazioniCut(imponibileIrpef);
      const { addizionaliDovute: addizionali, impostaNetta } = calculateNetTaxDue({
        impostaLorda: irpefLorda,
        addizionali: imponibileIrpef * (config.addizionaliPerc || 0),
        detrazioni: detrazioneLavoro + Math.max(ulterioriDetrazioni - riduzioneDetrazioniAltiRedditi, 0)
      });
      const trattamentoIntegrativo = calculateTrattamentoIntegrativo({
        reddito: imponibileIrpef,
        impostaLorda: irpefLorda,
        detrazioniLavoro: detrazioneLavoro,
        ulterioriDetrazioni
      });
      const bonusCuneo = calculateBonusCuneoFiscale(imponibileIrpef, imponibileLavoro);

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
      const annualState = row._state ? { ...row._state } : this._createStrategyState();
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
        addizionaliPerc: config.addizionaliPerc,
        ulterioriDetrazioni: config.ulterioriDetrazioni,
        quotaMinAderente: fpBase * (config.quotaMinAderentePerc || 0),
        modalitaVersamentoFp: config.modalitaVersamentoFp,
        limiteDeduzioneTotale: limiteAnno
      };
      const taxComparison = calculateTaxComparison({ ...taxInputs, quotaBustaFp: row.quotaFpBusta || 0 });
      const baselinePayroll = Math.min(quotaFp, taxInputs.quotaMinAderente);
      const baselineTaxComparison = calculateTaxComparison({ ...taxInputs, quotaBustaFp: baselinePayroll });
      const allPayrollTaxComparison = calculateTaxComparison({ ...taxInputs, quotaBustaFp: quotaFp });

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
        aliquotaMarginale,
        impostaAnnoLorda: irpefLorda + addizionali,
        detrazioneLavoro,
        ulterioriDetrazioni,
        riduzioneDetrazioniAltiRedditi,
        sogliaRedditiAlti: CURRENT_FISCAL_RULES.irpef.highIncomeAdjustment.threshold,
        impostaNetta,
        trattamentoIntegrativo,
        bonusCuneo,
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
        investimentoPersonaleAnno: quotaFp + (row.quotaPacConsigliata || 0),
        spesaEffettivaAnno: Math.max(quotaFp + (row.quotaPacConsigliata || 0) - risparmio, 0),
        beneficioInvestitoAnno: risparmio,
        totaleMessoAlLavoroAnno: quotaFp + (row.quotaPacConsigliata || 0) + datore,
        taxComparison,
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
        budgetBase: cfg.modalitaCumulativa || anno === 1 ? investimentoAnno : 0,
        // Aliquota "se esci a fine di quest'anno": è quella giusta per le
        // colonne exit della tabella, non per le scelte di allocazione.
        tassazioneFP: this.calcolaTassazioneFp(cfg.anzianitaPregressaFp + anno - 1, cfg.riscattoAnticipato),
        anniResidui: cfg.durata - anno + 1
      };
    }

    /**
     * Loop annuale unico per entrambe le modalità di confronto.
     *
     * Le due modalità cambiano soltanto come si ricava il budget netto:
     *  - budgetLordo: l'input è la spesa personale effettiva.
     *  - sacrificioNetto: l'input è l'investimento personale complessivo;
     *    il modello ricava la spesa che lo finanzia con l'allocazione ottima.
     */
    _simulateStrategies(cfg) {
      const isInvestmentTarget = cfg.modalitaConfronto === 'sacrificioNetto';
      const reinvestiRisparmio = false;
      const includeTaxSavingsInExit = false;

      const optimizedResults = [];
      const fpStrategyResults = [];
      const pacStrategyResults = [];
      const rFP = cfg.rendimentoAnnualeFpPerc;
      const rPAC = cfg.rendimentoAnnualePacPerc;
      const growthOptions = this._createGrowthOptions(cfg);

      const fpPlan = this._createStrategyState();
      const pacPlan = this._createStrategyState();
      const recommendedPlan = this._createStrategyState();

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

        // Parametri fiscali e finanziari comuni a tutti i candidati.
        const optimizerInputs = {
          quotaMinAderente: ctx.quotaMinAderente,
          quotaDatorePotenziale: ctx.quotaDatorePotenziale,
          reddito: ctx.redditoLavoroAnno,
          altriRedditi: ctx.altriRedditiAnno,
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
          tassazioneFpScadenza,
          fpAlreadyActive: recommendedPlan.montanteFP > 0,
          pacAlreadyActive: recommendedPlan.montantePAC > 0
        };

        const resolved = isInvestmentTarget
          ? this._resolveInvestmentTarget(ctx.budgetBase, optimizerInputs)
          : {
              netBudget: ctx.budgetBase,
              allocation: this._optimizeAllocation({ ...optimizerInputs, netBudget: ctx.budgetBase })
            };
        const commonNetBudget = resolved.netBudget;
        const recommendedAllocation = resolved.allocation;

        // Benchmark: in modalità Spesa confrontano a parità di sacrificio
        // (stessa spesa netta dell'ottimale); in modalità Investimento a
        // parità di versamento (tutti versano il target, il beneficio
        // fiscale resta in tasca).
        const fpFirst = this._resolveAllFpAllocation({
          ...optimizerInputs,
          netBudget: commonNetBudget,
          investmentTarget: isInvestmentTarget ? ctx.budgetBase : null,
          fpAlreadyActive: fpPlan.montanteFP > 0,
          pacAlreadyActive: fpPlan.montantePAC > 0
        });
        const fpAllocation = {
          quotaDeducibile: fpFirst.quotaFp,
          quotaFpDeducibile: fpFirst.quotaFpDeducibile,
          quotaFpNonDeducibile: fpFirst.quotaFpNonDeducibile,
          quotaExtraPac: fpFirst.quotaPac,
          quotaDatore: fpFirst.quotaDatore,
          contributoFpDeducibile: fpFirst.contributoFpDeducibile
        };
        const fpPaymentSplit = fpFirst;

        const risparmioFpAnnoEffettivo = fpPaymentSplit.risparmio;
        const pacContributoAnno = isInvestmentTarget ? ctx.budgetBase : commonNetBudget;
        const mixQuote = {
          quotaEntroDedAnno: recommendedAllocation.quotaFpDeducibile,
          quotaExtraDedAnno: recommendedAllocation.quotaPac,
          aderenteAnno: recommendedAllocation.quotaFp + recommendedAllocation.quotaPac
        };
        const pacQuote = {
          quotaEntroDedAnno: 0,
          quotaExtraDedAnno: pacContributoAnno,
          aderenteAnno: pacContributoAnno
        };

        this._applyYearGrowth(fpPlan, {
          fpContributo: fpAllocation.quotaDeducibile + fpAllocation.quotaDatore,
          fpContributoDeducibile: fpAllocation.contributoFpDeducibile,
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
          fpContributoDeducibile: 0,
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
          fpContributoDeducibile: recommendedAllocation.contributoFpDeducibile,
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
          ...minSplit(recommendedAllocation.quotaFp),
          quotaEntroDedAnno: mixQuote.quotaEntroDedAnno,
          quotaExtraDedAnno: mixQuote.quotaExtraDedAnno,
          aderenteAnno: mixQuote.aderenteAnno,
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
          exitFP,
          exitPAC,
          exitMix: exitRecommended,
          strategyState: recommendedPlan
        }));

        fpStrategyResults.push(this._createResultRow({
          anno,
          ...minSplit(fpAllocation.quotaDeducibile),
          quotaEntroDedAnno: fpAllocation.quotaFpDeducibile,
          quotaExtraDedAnno: fpAllocation.quotaExtraPac,
          aderenteAnno: fpAllocation.quotaDeducibile + fpAllocation.quotaExtraPac,
          datoreAnno: fpAllocation.quotaDatore,
          risparmioAnnoEffettivo: risparmioFpAnnoEffettivo,
          quotaFpConsigliataAnno: fpAllocation.quotaDeducibile,
          quotaFpDeducibileAnno: fpAllocation.quotaFpDeducibile,
          quotaFpNonDeducibileAnno: fpAllocation.quotaFpNonDeducibile,
          quotaDatoreDeducibileAnno: fpFirst.quotaDatoreDeducibile,
          quotaPacConsigliataAnno: fpAllocation.quotaExtraPac,
          quotaPacOltreLimiteAnno: fpFirst.quotaPacOltreLimite,
          quotaBustaAnno: fpPaymentSplit.quotaBusta,
          quotaBonificoAnno: fpPaymentSplit.quotaBonifico,
          risparmioOttimizzazioneBustaAnno: fpPaymentSplit.extraRisparmioVersamento,
          sceltaAnno: 'FP',
          exitFP,
          exitPAC,
          exitMix: exitFP,
          strategyState: fpPlan
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
          quotaFpDeducibileAnno: 0,
          quotaFpNonDeducibileAnno: 0,
          quotaDatoreDeducibileAnno: 0,
          quotaPacConsigliataAnno: pacContributoAnno,
          quotaPacOltreLimiteAnno: Math.max(pacContributoAnno - this._getTotalDeductionLimit(), 0),
          quotaBustaAnno: 0,
          quotaBonificoAnno: 0,
          risparmioOttimizzazioneBustaAnno: 0,
          sceltaAnno: 'PAC',
          exitFP,
          exitPAC,
          exitMix: exitPAC,
          strategyState: pacPlan
        }));
      }

      // In modalità Spesa tutte le serie condividono lo stesso sacrificio:
      // se un benchmark batte l'ottimizzatore all'ultimo anno diventa la
      // serie principale. In modalità Investimento i benchmark non
      // rispettano il vincolo dell'utente (investono la spesa, non il
      // target): la serie principale resta quella dell'ottimizzatore.
      const finalOptimized = optimizedResults.at(-1).exitMix;
      const finalFp = optimizedResults.at(-1).exitFp;
      const finalPac = optimizedResults.at(-1).exitPac;
      const selectedStrategy = isInvestmentTarget
        ? { results: optimizedResults, plan: recommendedPlan, exit: finalOptimized }
        : [
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
        tir: {
          // Il TIR "ottimale" viene dalla serie effettivamente selezionata:
          // serie, exit e TIR devono raccontare lo stesso scenario.
          mix: calculateStrategyIrr(results),
          fp: calculateStrategyIrr(fpStrategyResults),
          pac: calculateStrategyIrr(pacStrategyResults)
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
        contributiFpDeducibili: 0,
        contributiFpNonDeducibili: 0,
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
     * Cerca la quota FP, euro per euro fino al limite deducibile, rispettando
     * il vincolo: quota FP - beneficio fiscale + quota PAC = budget netto.
     * Massimizza il valore netto finale entro le regole della strategia
     * ottimale: la quota volontaria non deducibile resta destinata al PAC.
     */
    _optimizeAllocation({
      netBudget,
      investmentTarget = null,
      quotaMinAderente,
      quotaDatorePotenziale,
      reddito,
      altriRedditi = 0,
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
      tassazioneFpScadenza,
      fpAlreadyActive = false,
      pacAlreadyActive = false
    }) {
      // Con investmentTarget il vincolo è sull'investimento personale
      // (quota FP + quota PAC = target): il risparmio dipende solo dalla
      // quota FP, quindi il target si impone esattamente senza iterazioni,
      // anche dove i cliff fiscali rendono il beneficio discontinuo.
      const isTargetMode = Number.isFinite(investmentTarget);
      if (isTargetMode ? investmentTarget <= 0 : netBudget <= 0) {
        return {
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
          scelta: 'PAC'
        };
      }

      const candidates = new Set([0]);
      const maxWithoutEmployer = this._getAvailableDeductionLimit(0);
      const maxWithEmployer = this._getAvailableDeductionLimit(quotaDatorePotenziale);

      for (let amount = 0; amount <= Math.floor(maxWithoutEmployer); amount++) {
        candidates.add(amount);
      }
      candidates.add(maxWithoutEmployer);
      candidates.add(maxWithEmployer);
      candidates.add(quotaMinAderente);

      // Il montante a scadenza di un contributo singolo è lineare nel
      // contributo: il fattore di capitalizzazione si calcola una volta sola
      // invece di rifare il loop sugli anni residui per ognuno dei
      // (potenziali) ~5.300 candidati.
      const fpOptionsWithoutFixed = { ...fpGrowthOptions, costoFissoAnnuo: 0 };
      const pacOptionsWithoutFixed = { ...pacGrowthOptions, costoFissoAnnuo: 0 };
      const fpFactor = this._projectFpContribution(1, rFP, anniResidui, fpOptionsWithoutFixed);
      const pacFactor = this._projectPacContribution(1, rPAC, anniResidui, pacOptionsWithoutFixed);
      const limiteDeduzioneTotale = this._getTotalDeductionLimit();

      let best = null;

      for (const candidate of candidates) {
        const quotaFp = Math.max(candidate, 0);
        const quotaDatore = quotaFp >= quotaMinAderente ? quotaDatorePotenziale : 0;
        const limiteDeduzione = this._getAvailableDeductionLimit(quotaDatore);
        // Regola ordinaria: il FP personale non supera lo spazio deducibile.
        // Unica eccezione: la quota minima esatta resta valutabile quando è
        // necessaria a ottenere il contributo datoriale.
        const massimoFpAmmesso = quotaDatore > 0
          ? Math.max(limiteDeduzione, quotaMinAderente)
          : limiteDeduzione;
        if (quotaFp > massimoFpAmmesso + 0.005) continue;

        const quotaFpDeducibile = Math.min(quotaFp, limiteDeduzione);
        const quotaFpNonDeducibile = Math.max(quotaFp - quotaFpDeducibile, 0);
        const quotaDatoreDeducibile = Math.min(quotaDatore, limiteDeduzioneTotale);
        const quotaDatoreNonDeducibile = Math.max(quotaDatore - quotaDatoreDeducibile, 0);
        const contributoFpDeducibile = Math.min(
          quotaFpDeducibile + quotaDatoreDeducibile,
          limiteDeduzioneTotale
        );

        const paymentSplit = this._chooseBestPaymentSplit({
          quotaFp,
          quotaDatore,
          quotaMinAderente,
          modalitaVersamentoFp,
          reddito,
          altriRedditi,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          limiteDeduzioneTotale
        });
        const risparmio = paymentSplit.risparmio;
        let surplus;
        if (isTargetMode) {
          if (quotaFp > investmentTarget + 0.005) continue;
          surplus = Math.max(investmentTarget - quotaFp, 0);
        } else {
          const surplusGrezzo = netBudget - quotaFp + risparmio;
          if (surplusGrezzo < -0.01) continue;
          surplus = Math.max(surplusGrezzo, 0);
        }
        // L'eccedenza oltre la quota FP dedotta va allo strumento che rende
        // di più per euro versato: PAC (tassato sul gain all'exit) oppure
        // FP non dedotto (rendimento del fondo, esente in uscita). Così
        // l'ottimale può degenerare in "tutto FP" quando conviene davvero.
        const pacPerEuro = this._calculatePacExit(pacFactor, 1, pacExitOptions);
        const surplusToFp = surplus > 0 && fpFactor > pacPerEuro + 1e-9;
        const quotaPac = surplusToFp ? 0 : surplus;
        const quotaFpExtra = surplusToFp ? surplus : 0;
        const quotaFpTotale = quotaFp + quotaFpExtra;
        const quotaFpNonDeducibileTotale = quotaFpNonDeducibile + quotaFpExtra;
        const quotaPacOltreLimite = Math.max((quotaFpTotale + quotaPac) - massimoFpAmmesso, 0);
        const fpContributo = quotaFpTotale + quotaDatore;
        // Il beneficio fiscale è già capacità di investimento nello stesso
        // anno: non va sommato una seconda volta al valore di uscita.
        const fpFixedDrag = !fpAlreadyActive && fpContributo > 0
          ? this._projectFixedCostDrag(fpGrowthOptions, rFP, anniResidui, true) : 0;
        const pacFixedDrag = !pacAlreadyActive && quotaPac > 0
          ? this._projectFixedCostDrag(pacGrowthOptions, rPAC, anniResidui, false) : 0;
        const fpValoreLordo = Math.max((fpContributo * fpFactor) - fpFixedDrag, 0);
        const fpNetto = fpValoreLordo - (calculateFpExitTaxBase(
          fpValoreLordo,
          contributoFpDeducibile,
          quotaFpNonDeducibileTotale + quotaDatoreNonDeducibile
        ) * tassazioneFpScadenza);
        const pacNetto = this._calculatePacExit(Math.max((quotaPac * pacFactor) - pacFixedDrag, 0), quotaPac, pacExitOptions);
        const totaleNetto = fpNetto + pacNetto;
        // A parità di investimento (target mode) la spesa varia col
        // beneficio: si massimizza exit meno spesa, cioè netto + risparmio.
        const valore = isTargetMode ? totaleNetto + risparmio : totaleNetto;

        if (!best || valore > best.valore) {
          best = {
            quotaFp: quotaFpTotale,
            quotaFpDeducibile,
            quotaFpNonDeducibile: quotaFpNonDeducibileTotale,
            quotaPac,
            quotaPacOltreLimite,
            quotaDatore,
            quotaDatoreDeducibile,
            quotaDatoreNonDeducibile,
            contributoFpDeducibile,
            risparmio,
            totaleNetto,
            valore,
            ...paymentSplit,
            // L'eccedenza destinata al FP non dedotto viaggia per bonifico:
            // lo split busta/bonifico deve coprire l'intera quota FP.
            quotaBonifico: paymentSplit.quotaBonifico + quotaFpExtra
          };
        }
      }

      if (!best) {
        const fallbackPac = isTargetMode ? investmentTarget : netBudget;
        best = {
          quotaFp: 0,
          quotaFpDeducibile: 0,
          quotaFpNonDeducibile: 0,
          quotaPac: fallbackPac,
          quotaPacOltreLimite: Math.max(fallbackPac - this._getTotalDeductionLimit(), 0),
          quotaDatore: 0,
          quotaDatoreDeducibile: 0,
          quotaDatoreNonDeducibile: 0,
          contributoFpDeducibile: 0,
          risparmio: 0,
          totaleNetto: 0,
          valore: 0,
          quotaBusta: 0,
          quotaBonifico: 0
        };
      }

      const scelta = best.quotaFp < 0.5
        ? 'PAC'
        : best.quotaPac < 0.5
          ? 'FP'
          : 'MIX';

      return { ...best, scelta };
    }

    /**
     * Costruisce il benchmark "FP a deduzione + PAC": riempie il FP fino al
     * plafond deducibile sostenibile (risolvendo quota - beneficio = budget)
     * e destina il resto al PAC. In modalità Investimento versa il target a
     * parità di versamento. Unico FP non dedotto ammesso: la quota minima
     * quando serve a ottenere il datore.
     */
    _resolveAllFpAllocation({
      netBudget,
      investmentTarget = null,
      quotaMinAderente,
      quotaDatorePotenziale,
      reddito,
      altriRedditi = 0,
      contributiInpsPerc,
      massimaleContributivoInps,
      sogliaIvsAggiuntivo,
      aliquotaIvsAggiuntivaPerc,
      addizionaliPerc,
      ulterioriDetrazioni,
      modalitaVersamentoFp
    }) {
      const budget = Math.max(netBudget, 0);
      const limiteDeduzioneTotale = this._getTotalDeductionLimit();

      const evaluate = (amount) => {
        const quotaFp = Math.max(amount, 0);
        const quotaDatore = quotaFp >= quotaMinAderente ? quotaDatorePotenziale : 0;
        const limitePersonale = this._getAvailableDeductionLimit(quotaDatore);
        const quotaFpDeducibile = Math.min(quotaFp, limitePersonale);
        const quotaFpNonDeducibile = Math.max(quotaFp - quotaFpDeducibile, 0);
        const quotaDatoreDeducibile = Math.min(quotaDatore, limiteDeduzioneTotale);
        const quotaDatoreNonDeducibile = Math.max(quotaDatore - quotaDatoreDeducibile, 0);
        const contributoFpDeducibile = Math.min(
          quotaFpDeducibile + quotaDatoreDeducibile,
          limiteDeduzioneTotale
        );
        const paymentSplit = this._chooseBestPaymentSplit({
          quotaFp,
          quotaDatore,
          quotaMinAderente,
          modalitaVersamentoFp,
          reddito,
          altriRedditi,
          contributiInpsPerc,
          massimaleContributivoInps,
          sogliaIvsAggiuntivo,
          aliquotaIvsAggiuntivaPerc,
          addizionaliPerc,
          ulterioriDetrazioni,
          limiteDeduzioneTotale
        });
        return {
          quotaFp,
          quotaFpDeducibile,
          quotaFpNonDeducibile,
          quotaPac: 0,
          quotaPacOltreLimite: 0,
          quotaDatore,
          quotaDatoreDeducibile,
          quotaDatoreNonDeducibile,
          contributoFpDeducibile,
          ...paymentSplit,
          costoEffettivo: quotaFp - paymentSplit.risparmio
        };
      };

      const threshold = Math.max(quotaMinAderente, 0);
      const capSenzaDatore = this._getAvailableDeductionLimit(0);
      const capConDatore = Math.max(this._getAvailableDeductionLimit(quotaDatorePotenziale), threshold);

      // In modalità Investimento il benchmark versa il target: FP dedotto
      // fino al plafond, il resto a PAC. Il beneficio resta in tasca.
      if (Number.isFinite(investmentTarget)) {
        const target = Math.max(investmentTarget, 0);
        const cap = target >= threshold ? capConDatore : capSenzaDatore;
        const result = evaluate(Math.min(target, cap));
        return { ...result, quotaPac: Math.max(target - result.quotaFp, 0), scelta: 'FP' };
      }

      if (budget <= 0) return { ...evaluate(0), scelta: 'FP' };

      // Il contributo datoriale crea una possibile discontinuita in
      // corrispondenza della quota minima: cerchiamo la radice separatamente
      // prima e dopo quella soglia, senza mai superare il plafond deducibile.
      const ranges = threshold > 0
        ? [[0, Math.min(Math.max(threshold - 0.001, 0), capSenzaDatore)], [threshold, capConDatore]]
        : [[0, capSenzaDatore]];
      // Gli estremi dei range vengono aggiunti dal loop: qui bastano i
      // candidati sempre validi (zero e quota minima).
      const candidates = [evaluate(0), evaluate(threshold)];

      for (const [start, end] of ranges) {
        let low = start;
        let high = Math.max(end, start);
        let lowResult = evaluate(low);
        let highResult = evaluate(high);
        // Gli estremi del range restano candidati anche senza bisezione:
        // servono quando l'intero range è sotto (o sopra) il budget.
        candidates.push(lowResult, highResult);
        if (lowResult.costoEffettivo > budget || highResult.costoEffettivo < budget) continue;

        for (let iteration = 0; iteration < 50; iteration++) {
          const mid = (low + high) / 2;
          const result = evaluate(mid);
          if (result.costoEffettivo < budget) {
            low = mid;
            lowResult = result;
          } else {
            high = mid;
            highResult = result;
          }
        }
        candidates.push(lowResult, highResult);
      }

      // Mai sforare la spesa richiesta: tra i candidati sostenibili vince la
      // quota FP massima. Dove il beneficio è discontinuo (cliff di
      // trattamento integrativo/bonus) la spesa in solo FP può saltare: il
      // residuo non assorbibile va a PAC, così il benchmark resta un
      // confronto a parità di spesa.
      const sostenibili = candidates.filter((candidate) => candidate.costoEffettivo <= budget + 0.01);
      const pool = sostenibili.length ? sostenibili : [candidates[0]];
      const best = pool.reduce((current, candidate) => (
        candidate.quotaFp > current.quotaFp ? candidate : current
      ));
      const quotaPacResidua = Math.max(budget - best.costoEffettivo, 0);
      return { ...best, quotaPac: quotaPacResidua, scelta: 'FP' };
    }

    /**
     * Con input "Investimento" il vincolo sull'importo personale viene
     * imposto direttamente dentro l'ottimizzatore (investmentTarget):
     * il target è rispettato esattamente anche in presenza di cliff
     * fiscali che rendono il beneficio discontinuo. La spesa netta è
     * derivata a valle: investimento − beneficio.
     */
    _resolveInvestmentTarget(targetInvestment, optimizerInputs) {
      const target = Math.max(targetInvestment, 0);
      const allocation = this._optimizeAllocation({ ...optimizerInputs, investmentTarget: target });
      const netBudget = Math.max(allocation.quotaFp + allocation.quotaPac - allocation.risparmio, 0);
      return { netBudget, allocation };
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

    _projectFpContribution(contributo, rendimento, anni, options = {}) {
      return projectFpContribution(contributo, rendimento, anni, options);
    }

    _projectFixedCostDrag(options, rendimento, anni, isFp) {
      if (options.mode !== 'lordo' || !(options.costoFissoAnnuo > 0)) return 0;
      const withoutFixed = { ...options, costoFissoAnnuo: 0 };
      const oneYearFactor = isFp
        ? this._projectFpContribution(1, rendimento, 2, withoutFixed)
        : this._projectPacContribution(1, rendimento, 2, withoutFixed);
      const growth = Number.isFinite(oneYearFactor) ? oneYearFactor : 1;
      // Nel FP il costo fisso riduce il risultato imponibile dell'anno:
      // il drag effettivo è al netto dell'imposta sostitutiva risparmiata.
      const costoEffettivo = isFp
        ? options.costoFissoAnnuo * (1 - Math.min(Math.max(options.taxRate || 0, 0), 1))
        : options.costoFissoAnnuo;
      let drag = 0;
      for (let year = 0; year < anni; year++) drag = (drag * growth) + costoEffettivo;
      return drag;
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
      quotaFpDeducibileAnno = quotaFpConsigliataAnno,
      quotaFpNonDeducibileAnno = 0,
      quotaDatoreDeducibileAnno = datoreAnno,
      quotaPacConsigliataAnno,
      quotaPacOltreLimiteAnno = 0,
      quotaBustaAnno,
      quotaBonificoAnno,
      risparmioOttimizzazioneBustaAnno = 0,
      sceltaAnno,
      exitFP,
      exitPAC,
      exitMix,
      strategyState = null
    }) {
      const row = {
        anno,
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
        scelta: sceltaAnno,
        exitFp: Math.round(exitFP),
        exitPac: Math.round(exitPAC),
        exitMix: Math.round(exitMix)
      };
      // Dettaglio numerico esatto per l'esploratore. Non è enumerabile:
      // CSV, link condivisi e contratto pubblico delle righe restano invariati.
      if (strategyState) {
        Object.defineProperty(row, '_state', {
          value: { ...strategyState },
          enumerable: false
        });
      }
      return row;
    }

    /**
     * Calcola il primo anno in cui tutta la quota deducibile va nel FP.
     * Prima di questo anno il mix puo comunque usare uno split FP/PAC.
     * @param {Array} results - Risultati dei calcoli
     * @returns {number|null} Primo anno FP pieno o null se non avviene
     */
    _calculateFirstFullFpYear(results) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].scelta === 'FP' || (results[i].quotaFpConsigliata > 0 && results[i].quotaPacConsigliata < 1)) {
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
      altriRedditi = 0,
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
            candidate.quotaBusta,
            altriRedditi
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
          baselineSplit.quotaBusta,
          altriRedditi
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
          allBustaSplit.quotaBusta,
          altriRedditi
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
      quotaBustaFp = null,
      altriRedditi = 0
    ) {
      return calculateTaxSavings({
        reddito,
        altriRedditi,
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
        ['exitFp', 'Exit FP'],
        ['exitPac', 'Exit PAC'],
        ['exitMix', 'Exit Mix']
      ];

      const header = columns.map(([, label]) => label).join(',');
      const lines = rows.map((row) => columns.map(([key]) => row[key]).join(','));
      return [header, ...lines, ''].join('\r\n');
    }
  }
