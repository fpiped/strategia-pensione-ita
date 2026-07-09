/**
 * Persistenza e condivisione dello scenario.
 *
 * Lo scenario è la porzione dello store che descrive gli input dell'utente:
 * le chiavi di FIELDS più la modalità addizionali e l'etichetta del comune.
 * Viene serializzato come differenza rispetto ai valori predefiniti, così
 * localStorage e URL restano piccoli e uno scenario mai toccato non produce
 * nulla da salvare.
 *
 * Ogni valore che rientra (da localStorage o da un link condiviso) passa da
 * sanitizeScenario: chiavi sconosciute scartate, tipi verificati, numeri
 * riportati nei limiti dei campi. I payload portano una versione (v: 1) per
 * poter cambiare formato in futuro senza rompere i vecchi link.
 */

import { FIELDS, clampNumber } from '../bindings.js';

const STORAGE_KEY = 'strategia-pensione-scenario-v1';
// Lo scenario viaggia nel fragment (#s=...), non nella query string: il
// fragment non viene inviato al server, quindi i parametri (es. reddito)
// non finiscono nei log di chi serve la pagina.
const SHARE_PREFIX = '#s=';
const PAYLOAD_VERSION = 1;
const MAX_TEXT_LENGTH = 200;

const EXTRA_KEYS = ['localTaxMode', 'municipalityLabel'];

const scenarioKeys = () => [...FIELDS.map((field) => field.key), ...EXTRA_KEYS];

/**
 * Valida una patch grezza contro i descrittori dei campi. I numeri vengono
 * riportati nei limiti valutando i campi nell'ordine di FIELDS, così i
 * limiti dinamici (es. valore aumento in % vs EUR) vedono già il tipo scelto.
 * @returns {Object|null} patch con le sole chiavi valide, o null se vuota
 */
export function sanitizeScenario(raw, defaults) {
  if (!raw || typeof raw !== 'object') return null;
  const state = { ...defaults };
  const patch = {};
  for (const field of FIELDS) {
    if (!(field.key in raw)) continue;
    const value = raw[field.key];
    switch (field.type) {
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) break;
        patch[field.key] = clampNumber(value, field, state);
        break;
      case 'hidden-number':
        if (typeof value !== 'number' || !Number.isFinite(value)) break;
        patch[field.key] = value;
        break;
      case 'checkbox':
        if (typeof value === 'boolean') patch[field.key] = value;
        break;
      default: // select, radio, text, hidden-text
        if (typeof value === 'string' && value.length <= MAX_TEXT_LENGTH) {
          patch[field.key] = value;
        }
    }
    if (field.key in patch) state[field.key] = patch[field.key];
  }
  if (raw.localTaxMode === 'auto' || raw.localTaxMode === 'manual') {
    patch.localTaxMode = raw.localTaxMode;
  }
  if (typeof raw.municipalityLabel === 'string' && raw.municipalityLabel.length <= MAX_TEXT_LENGTH) {
    patch.municipalityLabel = raw.municipalityLabel;
  }
  return Object.keys(patch).length ? patch : null;
}

/** Chiavi dello scenario il cui valore differisce dai predefiniti. */
export function diffScenario(state, defaults) {
  const diff = {};
  for (const key of scenarioKeys()) {
    if (!Object.is(state[key], defaults[key])) diff[key] = state[key];
  }
  return diff;
}

// btoa/atob lavorano su stringhe di byte: il passaggio da TextEncoder rende
// l'encoding sicuro anche con caratteri non ASCII (es. nomi di comuni).
function toBase64Url(json) {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Serializza una diff di scenario nel formato usato nell'URL. */
export function encodeScenario(diff) {
  return toBase64Url(JSON.stringify({ v: PAYLOAD_VERSION, ...diff }));
}

/** @returns {Object|null} payload decodificato, o null se corrotto o di versione ignota */
export function decodeScenario(encoded) {
  if (typeof encoded !== 'string' || !encoded) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encoded));
    if (!payload || typeof payload !== 'object' || payload.v !== PAYLOAD_VERSION) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * URL che riproduce lo scenario corrente. Con lo scenario ai predefiniti
 * restituisce l'URL pulito, senza fragment.
 */
export function buildShareUrl(state, defaults, baseUrl = window.location.href) {
  const url = new URL(baseUrl);
  url.hash = '';
  const diff = diffScenario(state, defaults);
  if (Object.keys(diff).length) {
    url.hash = SHARE_PREFIX.slice(1) + encodeScenario(diff);
  }
  return url.toString();
}

/** Scenario dal fragment #s= dell'URL corrente, già sanitizzato. */
export function readSharedScenario(defaults) {
  try {
    const hash = window.location.hash;
    if (!hash.startsWith(SHARE_PREFIX)) return null;
    const payload = decodeScenario(hash.slice(SHARE_PREFIX.length));
    return payload ? sanitizeScenario(payload, defaults) : null;
  } catch {
    return null;
  }
}

/** Toglie il fragment di condivisione dalla barra degli indirizzi. */
export function clearSharedScenarioFromUrl() {
  try {
    if (!window.location.hash.startsWith(SHARE_PREFIX)) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    // URL non modificabile (es. ambiente senza history): il link resta com'è.
  }
}

/** Salva la diff in localStorage; ai predefiniti rimuove la voce. */
export function saveScenario(state, defaults) {
  try {
    const diff = diffScenario(state, defaults);
    if (Object.keys(diff).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: PAYLOAD_VERSION, ...diff }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage pieno o disabilitato (es. navigazione privata): niente persistenza.
  }
}

/** @returns {Object|null} scenario salvato in localStorage, già sanitizzato */
export function loadSavedScenario(defaults) {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== 'object' || payload.v !== PAYLOAD_VERSION) return null;
    return sanitizeScenario(payload, defaults);
  } catch {
    return null;
  }
}

export function clearSavedScenario() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage non disponibile: non c'era nulla da rimuovere.
  }
}
