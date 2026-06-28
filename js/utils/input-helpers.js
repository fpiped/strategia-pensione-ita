export function buildInputWarnings(config) {
  const warnings = [];
  const redditoTotale = config.reddito + Math.max(config.premiStraordinari || 0, 0);
  const baseContributivaFp = config.baseContributivaFpTipo !== 'ral' && config.baseContributivaFp > 0
    ? config.baseContributivaFp
    : config.reddito;
  const baseDatoreFp = config.baseDatoreFpTipo && config.baseDatoreFpTipo !== 'same' && config.baseDatoreFpTipo !== 'ral' && config.baseDatoreFp > 0
    ? config.baseDatoreFp
    : baseContributivaFp;
  const investimentoMinimoDatore = baseContributivaFp * config.quotaMinAderentePerc;

  if (config.investimento > redditoTotale * 0.5 && redditoTotale > 0) {
    warnings.push('Investimento annuo molto alto rispetto al reddito: verifica che sia sostenibile e netto di altre esigenze.');
  }

  if (config.variazioneRedditoFrequenza > 0 && config.variazioneRedditoValore < 0) {
    warnings.push('La variazione reddito è negativa: stai simulando una riduzione periodica della RAL.');
  }

  if (config.variazioneInvestimentoFrequenza > 0 && config.variazioneInvestimentoValore < 0) {
    warnings.push('La variazione investimento è negativa: stai simulando una riduzione periodica del budget annuo.');
  }

  if (config.baseContributivaFpTipo !== 'ral' && config.baseContributivaFp <= 0) {
    warnings.push('Hai selezionato una base contributi FP alternativa ma non hai inserito un valore annuo: il calcolo usa la RAL.');
  }

  if (config.baseDatoreFpTipo && config.baseDatoreFpTipo !== 'same' && config.baseDatoreFpTipo !== 'ral' && config.baseDatoreFp <= 0) {
    warnings.push('Hai selezionato una base datore alternativa ma non hai inserito un valore annuo: il calcolo usa la RAL.');
  }

  if (
    config.reddito > 0 &&
    config.baseContributivaFp > config.reddito &&
    (config.baseContributivaFpTipo !== 'ral' || (config.baseDatoreFpTipo && config.baseDatoreFpTipo !== 'same' && config.baseDatoreFpTipo !== 'ral'))
  ) {
    warnings.push('Minimo retributivo annuo superiore alla RAL: è insolito, verifica che il valore sia corretto.');
  }

  if (config.variazioneBaseContributivaFrequenza > 0 && config.variazioneBaseContributivaValore < 0) {
    warnings.push('La variazione base contributi FP è negativa: stai simulando una riduzione periodica della base per quota minima e contributo datore.');
  }

  if (config.contributiInpsPerc < 0.0919 || config.contributiInpsPerc > 0.0949) {
    warnings.push('Aliquota INPS fuori dal range tipico 9,19%-9,49%: va bene se stai usando il dato reale della busta paga.');
  }

  if (config.massimaleContributivoInps > 0 && config.sogliaIvsAggiuntivo > config.massimaleContributivoInps) {
    warnings.push('La soglia IVS aggiuntivo è superiore al massimale INPS: in questo scenario l’IVS aggiuntivo non verrà applicato.');
  }

  if (
    config.investimento < investimentoMinimoDatore &&
    (config.quotaDatoreFpPerc > 0 || config.contributoDatoreFisso > 0)
  ) {
    warnings.push('Con questi input non raggiungi la quota minima per ottenere il contributo del datore.');
  }

  if (baseDatoreFp !== baseContributivaFp && config.quotaDatoreFpPerc > 0) {
    warnings.push('Quota aderente e contributo datore usano basi diverse: verifica che questa impostazione corrisponda al tuo fondo/CCNL.');
  }

  const rendimentoNettoFp = Number.isFinite(config.rendimentoNettoFpEffettivo)
    ? config.rendimentoNettoFpEffettivo
    : config.rendimentoAnnualeFpPerc;
  const rendimentoNettoPac = Number.isFinite(config.rendimentoNettoPacEffettivo)
    ? config.rendimentoNettoPacEffettivo
    : config.rendimentoAnnualePacPerc;

  if (rendimentoNettoPac < rendimentoNettoFp) {
    warnings.push('Il rendimento netto PAC è più basso del rendimento netto FP: verifica l’ipotesi, perché in questo scenario il PAC non ha un vantaggio di rendimento atteso.');
  }

  if (rendimentoNettoPac - rendimentoNettoFp >= 0.06) {
    warnings.push('Il PAC ha un rendimento netto ipotizzato molto più alto del FP: il mix consigliato sarà particolarmente sensibile a questa scelta.');
  }

  if (config.addizionaliPerc > 0.04) {
    warnings.push('Addizionali sopra il 4%: controlla che la percentuale inserita includa solo regionale e comunale.');
  }

  if (config.ulterioriDetrazioni > 3000) {
    warnings.push('Ulteriori detrazioni elevate possono ridurre molto la capienza fiscale e quindi il beneficio della deduzione.');
  }

  if (config.primaOccupazionePost2006 && config.plafondExtraPrimaOccupazione <= 0) {
    warnings.push('Prima occupazione post 2006 attiva ma plafond extra residuo pari a zero: il limite deducibile resta quello ordinario.');
  }

  if (config.primaOccupazionePost2006 && config.anniResiduiMaggiorazione <= 0) {
    warnings.push('Prima occupazione post 2006 attiva ma anni residui maggiorazione pari a zero: il recupero extra non viene applicato.');
  }

  return warnings;
}
