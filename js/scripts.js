/**
 * Calcolatore Fondo Pensione vs PAC - Scripts
 * Versione Dashboard
 */
import { renderSiteIcons } from './icons.js';
import { HELP_CONTENT } from './constants/help-content.js';

document.addEventListener('DOMContentLoaded', function() {
    setupSiteIcons();
    setupThemeToggle();

    // Contatore visite (counterapi.dev): un incremento per caricamento;
    // se il servizio non risponde, il chip resta nascosto.
    fetch('https://api.counterapi.dev/v1/strategia-pensione-fpiped/homepage/up')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (!data || !Number.isFinite(data.count)) return;
            document.getElementById('visit-count').textContent = data.count.toLocaleString('it-IT');
            document.getElementById('visit-counter').hidden = false;
        })
        .catch(function() { /* offline o servizio non disponibile */ });

    // Inizializza la navigazione a tab
    setupTabs();

    // Inizializza i comportamenti di scrolling
    setupScrolling();

    // Inizializza toggle risultati
    setupResultsToggle();
    setupConfigToggle();

    // Sezioni apri/chiudi della guida informativa
    setupDocsSections();

    // Card del pannello di controllo apri/chiudi
    document.querySelectorAll('.control-shell .param-card .card-header').forEach(function(header) {
        makeHeadingToggle(header.querySelector('h3'), header.closest('.param-card'), header);
    });

    // Inizializza tooltip mobile
    setupMobileTooltips();
});

function setupSiteIcons() {
    renderSiteIcons();
}

function setupThemeToggle() {
    const STORAGE_KEY = 'strategia-pensione-theme';
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    const applyTheme = (theme) => {
        const normalized = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', normalized);
        toggle.dataset.theme = normalized;
        toggle.setAttribute('aria-pressed', String(normalized === 'dark'));
        toggle.setAttribute('aria-label', normalized === 'dark' ? 'Attiva tema chiaro' : 'Attiva tema scuro');
    };

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(currentTheme);

    toggle.addEventListener('click', () => {
        const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        const applyAndNotify = () => {
            applyTheme(nextTheme);
            try {
                localStorage.setItem(STORAGE_KEY, nextTheme);
            } catch (error) {
                // Storage non disponibile (es. navigazione privata): il tema resta solo per la sessione.
            }
            // Il controller ridisegna grafico e risultati in sincrono su
            // questo evento: dentro la callback finisce nel crossfade.
            window.dispatchEvent(new CustomEvent('strategia-theme-change', { detail: { theme: nextTheme } }));
        };

        // Cambio tema con crossfade unico dell'intera pagina (View
        // Transitions) invece della ricolorazione a pezzi elemento per
        // elemento; senza supporto o con movimento ridotto, cambio secco.
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (typeof document.startViewTransition === 'function' && !reduceMotion) {
            document.documentElement.setAttribute('data-theme-switching', '');
            const transition = document.startViewTransition(applyAndNotify);
            transition.finished.finally(() => {
                document.documentElement.removeAttribute('data-theme-switching');
            });
        } else {
            applyAndNotify();
        }
    });
}

/**
 * Rende un titolo-barra apri/chiudi usabile anche da tastiera e screen
 * reader: sposta il contenuto del titolo dentro un vero <button> con
 * aria-expanded. Il listener sta su clickArea (l'intera barra), dove
 * arriva per bubbling anche il click sintetico di Enter/Spazio sul button.
 */
function makeHeadingToggle(heading, target, clickArea) {
    if (!heading || !target) return;
    const area = clickArea || heading;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'heading-toggle';
    while (heading.firstChild) button.appendChild(heading.firstChild);
    heading.appendChild(button);

    const syncExpanded = () => {
        button.setAttribute('aria-expanded', String(!target.classList.contains('collapsed')));
    };
    syncExpanded();

    area.addEventListener('click', function() {
        target.classList.toggle('collapsed');
        syncExpanded();
    });
}

/**
 * Inizializza il toggle per mostrare/nascondere i parametri principali:
 * stesso meccanismo delle altre sezioni, titolo cliccabile in barra.
 */
function setupConfigToggle() {
    const toggleConfig = document.getElementById('config-title');
    makeHeadingToggle(toggleConfig, toggleConfig?.closest('.config-workspace'));
}

/**
 * Inizializza il toggle per mostrare/nascondere la tabella risultati
 */
function setupResultsToggle() {
    // Toggle tabella
    const toggleResults = document.getElementById('toggle-results');
    makeHeadingToggle(toggleResults, toggleResults?.closest('.results-section'));

    // Toggle sintesi risultato
    const toggleSummary = document.getElementById('toggle-summary');
    makeHeadingToggle(toggleSummary, toggleSummary?.closest('.results-workspace'));

    // Toggle esploratore annuale
    const toggleExplorer = document.getElementById('annual-explorer-title');
    makeHeadingToggle(toggleExplorer, toggleExplorer?.closest('.annual-explorer-section'));

    // Toggle grafico
    const toggleChart = document.getElementById('toggle-chart');
    makeHeadingToggle(toggleChart, toggleChart?.closest('.chart-section'));
}

/**
 * Inizializza la navigazione a tab. Il tab attivo viene ricordato, così il
 * refresh riporta alla stessa pagina (es. Informazioni) e non ai Calcoli.
 */
function setupTabs() {
    const STORAGE_KEY = 'strategia-pensione-active-tab';

    const clearHash = () => {
        // Il fragment #s= trasporta uno scenario condiviso: lo legge (e poi
        // lo rimuove) il controller, non va toccato dalla navigazione a tab.
        if (window.location.hash && !window.location.hash.startsWith('#s=')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    };

    const activateTab = (tabId) => {
        clearHash();
        const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
        const content = document.getElementById(`${tabId}-content`);
        if (!tab || !content) return;

        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active');
            t.removeAttribute('aria-current');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'true');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        content.classList.add('active');
    };

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            activateTab(tabId);
            try {
                localStorage.setItem(STORAGE_KEY, tabId);
            } catch (error) {
                // Storage non disponibile (es. navigazione privata): ignora.
            }
        });
    });

    // Il logo riporta alla home (pagina Calcola): azzera il tab salvato.
    document.querySelector('.logo')?.addEventListener('click', () => {
        try {
            localStorage.setItem(STORAGE_KEY, 'calculator');
        } catch (error) { /* storage non disponibile */ }
    });

    let savedTab = null;
    try {
        savedTab = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        savedTab = null;
    }
    if (savedTab) activateTab(savedTab);

    // Da qui in poi lo stato è gestito dalle classi: rimuovi l'attributo
    // anti-flash impostato dallo script inline in <head>.
    document.documentElement.removeAttribute('data-active-tab');
}

/**
 * Rende apri/chiudi le sezioni della guida informativa: ogni blocco che
 * inizia con un h2 diventa una card con titolo-barra cliccabile, nello
 * stesso stile delle sezioni della pagina calcoli.
 */
function setupDocsSections() {
    // Le sezioni sono già incapsulate staticamente nel markup: qui si
    // agganciano solo i toggle.
    document.querySelectorAll('.docs-collapsible > .docs-collapsible-title').forEach((title) => {
        makeHeadingToggle(title, title.closest('.docs-collapsible'));
    });

    // I link dell'indice riaprono la sezione e scrollano via JS,
    // senza sporcare la URL con l'hash.
    document.querySelectorAll('.docs-index a').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (!target) return;
            target.classList.remove('collapsed');
            window.scrollTo({ top: target.offsetTop - 20, behavior: 'smooth' });
        });
    });
}

/**
 * Inizializza lo scrolling fluido per i link della documentazione e il pulsante torna-su
 */
function setupScrolling() {
    // Pulsante torna in alto
    const goToTopButton = document.getElementById('go-to-top');

    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            goToTopButton.classList.add('visible');
        } else {
            goToTopButton.classList.remove('visible');
        }
    });

    goToTopButton.addEventListener('click', function(e) {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}


/**
 * Inizializza il sistema di help modale per le label
 */
function setupMobileTooltips() {
    const helpContent = HELP_CONTENT;
    // Renderer condiviso: costruisce le sezioni etichettate (dove / come /
    // cosa comporta) di una voce. Usato sia dal popover del pannello sia
    // dalle note della guidata, così le spiegazioni sono identiche per
    // costruzione.
    const HELP_SECTIONS = [
        ['dove', 'Dove si trova'],
        ['come', 'Come viene usato'],
        ['effetto', 'Cosa comporta']
    ];

    function buildHelpSections(help) {
        const fragment = document.createDocumentFragment();
        HELP_SECTIONS.forEach(([key, label]) => {
            if (!help[key]) return;
            const row = document.createElement('div');
            row.className = 'help-section';
            const tag = document.createElement('span');
            tag.className = 'help-section-label';
            tag.textContent = label;
            const text = document.createElement('p');
            text.className = 'help-section-text';
            text.textContent = help[key];
            row.append(tag, text);
            fragment.appendChild(row);
        });
        return fragment;
    }

    // Popola le note della modalità guidata dalla stessa fonte dei popover
    // del pannello: per ogni chiave in data-help-note viene renderizzata la
    // voce completa (titolo + sezioni).
    document.querySelectorAll('[data-help-note]').forEach(note => {
        const keys = (note.getAttribute('data-help-note') || '').split(/\s+/).filter(Boolean);
        const entries = keys
            .map(key => helpContent[key])
            .filter(Boolean)
            .map(help => {
                const entry = document.createElement('div');
                entry.className = 'help-entry';
                const title = document.createElement('strong');
                title.className = 'help-entry-title';
                title.textContent = help.title;
                entry.appendChild(title);
                entry.appendChild(buildHelpSections(help));
                return entry;
            });
        note.replaceChildren(...entries);
    });

    // Icona informativa accanto ai titoli cliccabili del pannello, per
    // rendere evidente che aprono la spiegazione.
    // L'icona informativa è disegnata in CSS (::after su .help-trigger):
    // presente dal primo paint, nessun flash al refresh.

    // Crea modal
    const modal = document.createElement('div');
    modal.className = 'help-modal';
    modal.innerHTML = `
        <div class="help-modal-backdrop"></div>
        <div class="help-modal-content">
                <div class="help-modal-header">
                <div class="help-modal-icon"><span data-lucide="info" class="icon" aria-hidden="true"></span></div>
                <div class="help-modal-title"></div>
                <button type="button" class="help-modal-close" aria-label="Chiudi">
                    <span data-lucide="x" class="icon" aria-hidden="true"></span>
                </button>
            </div>
            <div class="help-modal-text"></div>
        </div>
    `;
    document.body.appendChild(modal);
    renderSiteIcons();

    const modalTitle = modal.querySelector('.help-modal-title');
    const modalText = modal.querySelector('.help-modal-text');

    function closeModal() {
        modal.classList.remove('active');
    }

    function openModal(helpId) {
        const help = helpContent[helpId];
        if (!help) return;

        modalTitle.textContent = help.title;
        modalText.replaceChildren(buildHelpSections(help));
        modal.classList.add('active');
    }

    // Click su .help-trigger (solo il testo)
    document.querySelectorAll('.help-trigger').forEach(trigger => {
        trigger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const helpId = this.getAttribute('data-help');
            openModal(helpId);
        });
    });

    // Chiudi modal cliccando fuori
    modal.querySelector('.help-modal-backdrop').addEventListener('click', closeModal);
    modal.querySelector('.help-modal-close').addEventListener('click', closeModal);

    // Chiudi con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
    });
}
