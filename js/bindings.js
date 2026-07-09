/**
 * Binding dichiarativo campo ↔ store.
 *
 * Ogni voce di FIELDS descrive un parametro dell'utente: la chiave nello
 * store, l'input del pannello e (se esiste) il gemello nella modalità
 * guidata, più i limiti min/max. Da qui derivano:
 *  - hydrateState(): stato iniziale letto dal pannello (fonte canonica al load)
 *  - bindFields(store): listener input → store e rendering store → entrambe le UI
 *
 * Con una sola fonte di verità non serve più copiare i valori campo per
 * campo tra pannello e guidata: scrivere nello store aggiorna entrambi.
 */

const MONEY_MAX = 1000000;

// Gruppo "aumento periodico": andamento, tipo (%/EUR), frequenza e valore.
// Il tipo precede il valore perché i limiti del valore dipendono dal tipo
// (hydrateState valuta i campi in ordine).
const variationGroup = (panelBase, guidedBase) => [
  { key: `${panelBase}Andamento`, type: 'select', panel: `${panelBase}Andamento`, guided: `${guidedBase}-andamento` },
  { key: `${panelBase}Tipo`, type: 'radio', panel: `${panelBase}Tipo`, guided: `${guidedBase}-tipo`, fallback: 'percentuale' },
  { key: `${panelBase}Frequenza`, type: 'number', panel: `${panelBase}Frequenza`, guided: `${guidedBase}-frequenza`, min: 0, max: 100 },
  {
    key: `${panelBase}Valore`, type: 'number', panel: `${panelBase}Valore`, guided: `${guidedBase}-valore`, min: 0,
    max: (state) => (state[`${panelBase}Tipo`] === 'euro' ? MONEY_MAX : 100),
    // Freccine coerenti con l'unità: 100 EUR o 0,1 punti percentuali.
    step: (state) => (state[`${panelBase}Tipo`] === 'euro' ? '100' : '0.1')
  }
];

export const FIELDS = [
  { key: 'durata', type: 'number', panel: 'durata', guided: 'guided-durata', min: 1, max: 100 },
  { key: 'reddito', type: 'number', panel: 'reddito', guided: 'guided-reddito', min: 0, max: MONEY_MAX },
  { key: 'premiStraordinari', type: 'number', panel: 'premiStraordinari', guided: 'guided-premi', min: 0, max: MONEY_MAX },
  { key: 'altriRedditi', type: 'number', panel: 'altriRedditi', guided: 'guided-altri-redditi', min: 0, max: MONEY_MAX },
  { key: 'investimento', type: 'number', panel: 'investimento', guided: 'guided-investimento', min: 0, max: MONEY_MAX },
  { key: 'minimoRetributivoAnnuo', type: 'number', panel: 'minimoRetributivoAnnuo', guided: 'guided-minimo-retributivo', min: 0, max: MONEY_MAX },
  { key: 'ulterioriDetrazioni', type: 'number', panel: 'ulterioriDetrazioni', guided: 'guided-ulteriori-detrazioni', min: 0, max: MONEY_MAX },

  ...variationGroup('variazioneReddito', 'guided-variazione-reddito'),
  ...variationGroup('variazioneInvestimento', 'guided-variazione-investimento'),
  ...variationGroup('variazioneBaseContributiva', 'guided-variazione-base'),
  ...variationGroup('variazionePremi', 'guided-variazione-premi'),
  ...variationGroup('variazioneAltriRedditi', 'guided-variazione-altri-redditi'),

  { key: 'modalitaConfronto', type: 'select', panel: 'modalitaConfronto', guided: 'guided-modalita-confronto' },
  { key: 'baseContributivaFpTipo', type: 'select', panel: 'baseContributivaFpTipo', guided: 'guided-base-tipo' },
  { key: 'baseDatoreFpTipo', type: 'select', panel: 'baseDatoreFpTipo', guided: 'guided-base-datore-tipo' },
  { key: 'modalitaVersamentoFp', type: 'select', panel: 'modalitaVersamentoFp', guided: 'guided-modalita-versamento' },

  { key: 'quotaMinAderentePerc', type: 'number', panel: 'quotaMinAderentePerc', guided: 'guided-quota-min', min: 0, max: 100 },
  { key: 'contribuzioneDatoreFpPerc', type: 'number', panel: 'contribuzioneDatoreFpPerc', guided: 'guided-datore-perc', min: 0, max: 100 },
  { key: 'contributiInpsPerc', type: 'number', panel: 'contributiInpsPerc', guided: 'guided-contributi-inps', min: 0, max: 20 },
  { key: 'addizionaliPerc', type: 'number', panel: 'addizionaliPerc', guided: 'guided-addizionali', min: 0, max: 10 },
  { key: 'anzianitaPregressaFp', type: 'number', panel: 'anzianitaPregressaFp', guided: 'guided-anzianita', min: 0, max: 50 },
  { key: 'riscattoAnticipato', type: 'checkbox', panel: 'riscattoAnticipato', guided: 'guided-riscatto-anticipato' },

  { key: 'rendimentoAnnualeFpPerc', type: 'number', panel: 'rendimentoAnnualeFpPerc', guided: 'guided-rendimento-fp', min: 0, max: 100 },
  { key: 'rendimentoAnnualePacPerc', type: 'number', panel: 'rendimentoAnnualePacPerc', guided: 'guided-rendimento-pac', min: 0, max: 100 },
  { key: 'rendimentoFpMode', type: 'select', panel: 'rendimentoFpMode', guided: 'guided-rendimento-fp-mode' },
  { key: 'rendimentoPacMode', type: 'select', panel: 'rendimentoPacMode', guided: 'guided-rendimento-pac-mode' },
  { key: 'costiAnnuiFpPerc', type: 'number', panel: 'costiAnnuiFpPerc', guided: 'guided-costi-fp', min: 0, max: 5 },
  { key: 'costiAnnuiPacPerc', type: 'number', panel: 'costiAnnuiPacPerc', guided: 'guided-costi-pac', min: 0, max: 5 },
  { key: 'quotaAgevolataFpPerc', type: 'number', panel: 'quotaAgevolataFpPerc', guided: 'guided-quota-agevolata-fp', min: 0, max: 100 },
  { key: 'quotaAgevolataPacPerc', type: 'number', panel: 'quotaAgevolataPacPerc', guided: 'guided-quota-agevolata-pac', min: 0, max: 100 },

  // Addizionali locali: regione e comune sono condivisi tra pannello e
  // guidata; il testo di ricerca segue la selezione (gli autocomplete
  // restano gestiti dal controller).
  { key: 'regioneAddizionali', type: 'select', panel: 'regioneAddizionali', guided: 'guided-regione-addizionali' },
  { key: 'comuneAddizionali', type: 'hidden-text', panel: 'comuneAddizionali', guided: 'guided-comune-addizionali' },
  { key: 'comuneAddizionaliSearch', type: 'text', panel: 'comuneAddizionaliSearch', guided: 'guided-comune-addizionali-search' },

  // Parametri fissi presenti solo come input hidden del pannello: letti una
  // volta al load, non hanno controparte visibile da tenere allineata.
  { key: 'contributoDatoreFisso', type: 'hidden-number', panel: 'contributoDatoreFisso', fallback: 0 },
  { key: 'massimaleContributivoInps', type: 'hidden-number', panel: 'massimaleContributivoInps', fallback: 120607 },
  { key: 'sogliaIvsAggiuntivo', type: 'hidden-number', panel: 'sogliaIvsAggiuntivo', fallback: 55448 },
  { key: 'aliquotaIvsAggiuntivaPerc', type: 'hidden-number', panel: 'aliquotaIvsAggiuntivaPerc', fallback: 1 }
];

const resolveBound = (bound, state) => (typeof bound === 'function' ? bound(state) : bound);

export function clampNumber(rawValue, field, state) {
  const min = Number.isFinite(field.min) ? field.min : 0;
  if (!Number.isFinite(rawValue)) return min; // campo svuotato -> minimo
  const max = resolveBound(field.max, state);
  return Math.min(Math.max(rawValue, min), Number.isFinite(max) ? max : Infinity);
}

const byId = (id) => document.getElementById(id);
const radiosByName = (name) => [...document.querySelectorAll(`input[name="${name}"]`)];

/**
 * Legge lo stato iniziale dagli input del pannello (fonte canonica al load:
 * la guidata viene riallineata dal primo render, anche se il browser ne
 * ripristina i campi).
 */
export function hydrateState() {
  const state = {};
  for (const field of FIELDS) {
    switch (field.type) {
      case 'number':
        state[field.key] = clampNumber(parseFloat(byId(field.panel)?.value), field, state);
        break;
      case 'hidden-number': {
        const value = parseFloat(byId(field.panel)?.value);
        state[field.key] = Number.isFinite(value) ? value : field.fallback;
        break;
      }
      case 'checkbox':
        state[field.key] = Boolean(byId(field.panel)?.checked);
        break;
      case 'radio':
        state[field.key] = radiosByName(field.panel).find((radio) => radio.checked)?.value ?? field.fallback;
        break;
      default: // select, text, hidden-text
        state[field.key] = byId(field.panel)?.value ?? '';
    }
  }
  return state;
}

/**
 * Scarta dalla patch i valori di select/radio senza riscontro nel DOM
 * (es. scenario salvato o condiviso da una versione precedente dell'app):
 * applicarli lascerebbe il controllo su un'opzione inesistente.
 */
export function dropUnknownChoices(patch) {
  if (!patch) return patch;
  for (const field of FIELDS) {
    if (!(field.key in patch)) continue;
    if (field.type === 'select') {
      const select = byId(field.panel);
      if (select && ![...select.options].some((option) => option.value === patch[field.key])) {
        delete patch[field.key];
      }
    } else if (field.type === 'radio') {
      const radios = radiosByName(field.panel);
      if (radios.length && !radios.some((radio) => radio.value === patch[field.key])) {
        delete patch[field.key];
      }
    }
  }
  return Object.keys(patch).length ? patch : null;
}

function attachNumberInput(store, field, input) {
  input.min = String(field.min);
  if (typeof field.max === 'number') input.max = String(field.max);
  input.addEventListener('input', () => {
    const value = parseFloat(input.value);
    // Digitazione parziale o campo vuoto: lo store tiene l'ultimo valore
    // valido; il fallback al minimo scatta solo al change (blur).
    if (!Number.isFinite(value)) return;
    store.set({ [field.key]: clampNumber(value, field, store.get()) });
  });
  input.addEventListener('change', () => {
    const value = clampNumber(parseFloat(input.value), field, store.get());
    store.set({ [field.key]: value });
    input.value = String(store.get()[field.key]);
  });
}

function forEachSideElement(field, callback) {
  [field.panel, field.guided].filter(Boolean).forEach((id) => {
    if (field.type === 'radio') {
      const radios = radiosByName(id);
      if (radios.length) callback(radios);
    } else {
      const element = byId(id);
      if (element) callback(element);
    }
  });
}

/**
 * Collega tutti i campi allo store: listener input → store e subscription
 * store → DOM (pannello e guidata insieme). Esegue subito un primo render.
 */
export function bindFields(store) {
  for (const field of FIELDS) {
    switch (field.type) {
      case 'number':
        forEachSideElement(field, (input) => attachNumberInput(store, field, input));
        break;
      case 'select':
        forEachSideElement(field, (select) => {
          select.addEventListener('change', () => store.set({ [field.key]: select.value }));
        });
        break;
      case 'checkbox':
        forEachSideElement(field, (checkbox) => {
          checkbox.addEventListener('change', () => store.set({ [field.key]: checkbox.checked }));
        });
        break;
      case 'radio':
        forEachSideElement(field, (radios) => {
          radios.forEach((radio) => {
            radio.addEventListener('change', () => {
              if (radio.checked) store.set({ [field.key]: radio.value });
            });
          });
        });
        break;
      case 'text':
        forEachSideElement(field, (input) => {
          input.addEventListener('input', () => store.set({ [field.key]: input.value }));
        });
        break;
      default:
        break; // hidden-*: solo render / hydrate
    }
  }

  store.subscribe((state) => {
    // Limiti dinamici (valore aumento in % vs EUR): se il cambio di tipo
    // rende il valore fuori scala, viene riportato al massimo consentito.
    const patch = {};
    for (const field of FIELDS) {
      if (typeof field.max !== 'function') continue;
      const max = field.max(state);
      if (state[field.key] > max) patch[field.key] = max;
    }
    if (store.set(patch)) return; // il render arriva con la notifica in coda
    renderFields(state);
  });
  renderFields(store.get());
}

function renderNumber(state, field, input) {
  if (typeof field.max === 'function') {
    input.max = String(field.max(state));
    input.step = field.step(state);
  }
  const value = state[field.key];
  // Non riscrivere il campo attivo se il valore è già equivalente: evita
  // salti del cursore durante la digitazione (es. "030" vs 30). La riscrittura
  // del campo attivo resta per il clamp live oltre i limiti.
  if (input === document.activeElement && parseFloat(input.value) === value) return;
  if (parseFloat(input.value) !== value) input.value = String(value);
}

export function renderFields(state) {
  for (const field of FIELDS) {
    switch (field.type) {
      case 'number':
        forEachSideElement(field, (input) => renderNumber(state, field, input));
        break;
      case 'checkbox':
        forEachSideElement(field, (checkbox) => {
          checkbox.checked = state[field.key];
        });
        break;
      case 'radio':
        forEachSideElement(field, (radios) => {
          const target = radios.find((radio) => radio.value === state[field.key]);
          if (target && !target.checked) target.checked = true;
        });
        break;
      case 'select':
      case 'text':
      case 'hidden-text':
        forEachSideElement(field, (element) => {
          if (element.value !== state[field.key]) element.value = state[field.key];
        });
        break;
      default:
        break; // hidden-number: nessun consumatore DOM
    }
  }
}
