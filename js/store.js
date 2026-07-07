/**
 * Store centrale dell'applicazione: unica fonte di verità per gli input.
 *
 * Pannello e modalità guidata leggono e scrivono qui invece di sincronizzarsi
 * a vicenda campo per campo: un input aggiorna lo store, lo store notifica i
 * subscriber, e il rendering riporta il valore su entrambe le interfacce.
 */
export function createStore(initialState = {}) {
  const state = { ...initialState };
  const listeners = new Set();
  let notifying = false;
  let dirty = false;

  const notify = () => {
    // set() richiamato da un listener (es. valore derivato riscritto nello
    // store): la notifica riparte in coda invece di annidarsi.
    if (notifying) {
      dirty = true;
      return;
    }
    notifying = true;
    try {
      do {
        dirty = false;
        listeners.forEach((listener) => listener(state));
      } while (dirty);
    } finally {
      notifying = false;
    }
  };

  return {
    get() {
      return state;
    },

    /**
     * Applica una patch parziale; notifica solo se almeno un valore cambia.
     * @returns {boolean} true se lo stato è cambiato
     */
    set(patch) {
      let changed = false;
      for (const [key, value] of Object.entries(patch)) {
        if (!Object.is(state[key], value)) {
          state[key] = value;
          changed = true;
        }
      }
      if (changed) notify();
      return changed;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
