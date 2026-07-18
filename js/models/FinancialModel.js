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
  getTotalDeductionLimit,
  resolveContributionBase,
  resolveEmployerContributionBase
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
      return this._simulateOptimizedPlan(this._normalizeConfig(config));
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
        investimentoPersonaleAnno: row.investimentoLordo ?? (quotaFp + (row.quotaPacConsigliata || 0)),
        spesaEffettivaAnno: row.investimentoNetto ?? Math.max(quotaFp + (row.quotaPacConsigliata || 0) - risparmio, 0),
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
        addizionaliPerc = 0, ulterioriDetrazioni = 0,
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
        addizionaliPerc, ulterioriDetrazioni,
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

        const recommendedAllocation = this._allocateNetInvestment(
          ctx.netInvestmentTarget,
          optimizerInputs
        );
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
          exitOttimale: exitRecommended,
          planState: recommendedPlan
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

    _createPlanState() {
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
     * Cerca la quota FP euro per euro. Per ogni candidato ricalcola il
     * beneficio fiscale e investe nel PAC la capacità netta residua:
     * quota FP personale + quota PAC - beneficio = investimento netto.
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
      if (!Number.isFinite(netInvestmentTarget) || netInvestmentTarget <= 0) {
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
          scelta: 'NESSUNO'
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
        const grossInvestmentAvailable = netInvestmentTarget + risparmio;
        // Il candidato è sostenibile solo se il suo costo netto non supera
        // il budget. Il PAC assorbe l'eventuale capacità residua.
        if (quotaFp > grossInvestmentAvailable + 0.005) continue;
        const surplus = Math.max(grossInvestmentAvailable - quotaFp, 0);
        // L'eccedenza oltre la quota FP dedotta va allo strumento che rende
        // di più per euro versato: PAC (tassato sul gain all'exit) oppure
        // FP non dedotto (rendimento del fondo, esente in uscita). Così
        // l'ottimale può degenerare in "tutto FP" quando conviene davvero.
        const pacPerEuro = this._calculatePacExit(pacFactor, 1, pacExitOptions);
        const surplusToFp = surplus > 0 && fpFactor > pacPerEuro + 1e-9;
        // Anche l'eventuale FP non dedotto resta sulla griglia da 1 euro.
        // I centesimi residui rimangono nel PAC, che garantisce sempre la
        // riconciliazione esatta del budget netto.
        const quotaFpExtra = surplusToFp ? Math.floor(surplus) : 0;
        const quotaPac = surplus - quotaFpExtra;
        const quotaFpTotale = quotaFp + quotaFpExtra;
        const quotaFpNonDeducibileTotale = quotaFpNonDeducibile + quotaFpExtra;
        const quotaPacOltreLimite = Math.max((quotaFpTotale + quotaPac) - massimoFpAmmesso, 0);
        const fpContributo = quotaFpTotale + quotaDatore;
        // Il beneficio fiscale è già confluito in quota FP + quota PAC:
        // non va sommato una seconda volta al valore di uscita.
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
        const valore = totaleNetto;

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
        const fallbackPac = netInvestmentTarget;
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
        : best.quotaPac <= TECHNICAL_PAC_RESIDUAL_MAX
          ? 'FP'
          : 'MIX';

      return { ...best, scelta };
    }

    /**
     * Il target netto è sempre raggiungibile perché il PAC assorbe il
     * residuo di ogni quota FP sostenibile, anche in presenza di cliff.
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
      investimentoNettoAnno,
      exitOttimale,
      planState = null
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
        scelta: sceltaAnno,
        exitOttimale: Math.round(exitOttimale)
      };
      // Mantiene le quote non arrotondate per distinguere un vero PAC da un
      // residuo tecnico. La proprietà non entra in CSV, link o Object.keys.
      Object.defineProperty(row, '_allocation', {
        value: {
          quotaFp: quotaFpConsigliataAnno,
          quotaPac: quotaPacConsigliataAnno,
          investimentoLordo: investimentoLordoAnno,
          beneficioFiscale: risparmioAnnoEffettivo,
          pacResidualTechnical: quotaFpConsigliataAnno > 0
            && quotaPacConsigliataAnno > 0
            && quotaPacConsigliataAnno <= TECHNICAL_PAC_RESIDUAL_MAX
        },
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
        ['investimentoNetto', 'Investimento Netto'],
        ['investimentoLordo', 'Investimento Lordo'],
        ['exitOttimale', 'Exit Ottimale']
      ];

      const header = columns.map(([, label]) => label).join(',');
      const lines = rows.map((row) => columns.map(([key]) => row[key]).join(','));
      return [header, ...lines, ''].join('\r\n');
    }
  }
