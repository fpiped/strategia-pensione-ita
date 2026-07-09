/**
 * Calcolatore Fondo Pensione vs PAC - Scripts
 * Versione Dashboard
 */

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
    // window.renderSiteIcons è definita in js/icons.js (SVG inline).
    if (window.renderSiteIcons) window.renderSiteIcons();
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
    // Scrolling fluido per i link della documentazione
    document.querySelectorAll('.docs-nav a').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 20,
                    behavior: 'smooth'
                });
            }
        });
    });

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
 * Funzione helper per il download CSV
 * Chiamata dal modulo app.js
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);

    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Inizializza il sistema di help modale per le label
 */
function setupMobileTooltips() {
    // Definizione help content: fonte unica delle spiegazioni.
    // Ogni voce risponde sempre a tre domande, rese come sezioni etichettate:
    // dove si recupera il dato, come lo usa il modello, cosa comporta.
    const helpContent = {
        reddito: {
            title: 'Reddito annuo',
            dove: 'Contratto di lavoro, busta paga o Certificazione Unica: è la retribuzione annua lorda ordinaria da lavoratore dipendente.',
            come: 'Se scegli RAL come base, il modello la usa per quota minima aderente e contributo datore, oltre che per IRPEF e contributi INPS.',
            effetto: 'Più è alta, più cresce il beneficio della deduzione FP. Non è pensato per autonomi, partite IVA o regimi sostitutivi.'
        },
        premiStraordinari: {
            title: 'Premi, straordinari e bonus',
            dove: 'Voci imponibili separate in busta paga o nella Certificazione Unica.',
            come: 'Aumentano reddito fiscale e previdenziale, ma non la base su cui si calcolano quota minima FP e contributo datore.',
            effetto: 'Alzano l\'aliquota marginale, quindi possono aumentare il risparmio fiscale della deduzione.'
        },
        altriRedditi: {
            title: 'Altri redditi imponibili IRPEF',
            dove: 'Dichiarazione dei redditi: es. locazioni ordinarie o redditi diversi imponibili IRPEF.',
            come: 'Aumentano il reddito fiscale usato per aliquote e beneficio della deduzione.',
            effetto: 'Non toccano la base previdenziale né quella per quota minima e contributo datore.'
        },
        variazionePremi: {
            title: 'Aumento premi e bonus',
            dove: 'Ipotesi tua, basata su accordi aziendali o sullo storico personale.',
            come: 'Frequenza indica ogni quanti anni applicare l\'aumento; il valore può essere in percentuale o in euro.',
            effetto: 'Con andamento Costante i premi restano fissi per tutta la simulazione.'
        },
        variazioneAltriRedditi: {
            title: 'Aumento altri redditi',
            dove: 'Ipotesi tua, ad esempio adeguamenti previsti dei canoni di locazione.',
            come: 'Stessa logica degli altri aumenti: frequenza in anni e valore in percentuale o euro.',
            effetto: 'Se crescono, alzano aliquote e beneficio della deduzione negli anni successivi; con Costante restano fissi.'
        },
        variazioneReddito: {
            title: 'Aumento reddito',
            dove: 'Ipotesi tua: scatti di anzianità, rinnovi CCNL o avanzamenti previsti.',
            come: 'La frequenza indica ogni quanti anni applicare la variazione: con ogni 3 anni e aumento 5%, il reddito resta uguale per 3 anni e aumenta del 5% dal quarto, poi di nuovo dal settimo.',
            effetto: 'Un reddito crescente aumenta quota minima, contributo datore e risparmio fiscale negli anni.'
        },
        durata: {
            title: 'Durata simulazione',
            dove: 'Quanti anni mancano al momento in cui prevedi di ritirare il capitale (da 1 a 100).',
            come: 'Definisce l\'orizzonte della simulazione anno per anno.',
            effetto: 'Più è lunga, più pesano interesse composto e riduzione della tassazione FP in uscita (dal 15% verso il 9% dopo 15 anni di partecipazione).'
        },
        investimento: {
            title: 'Investimento annuo',
            dove: 'Il tuo budget: l\'importo che vuoi allocare ogni anno tra fondo pensione e PAC, TFR escluso.',
            come: 'La quota oltre il limite deducibile di 5.300 €/anno (incluso contributo datore, escluso TFR) viene considerata sempre PAC.',
            effetto: 'Budget più alti saturano prima la deduzione: l\'eccedenza lavora nel PAC.'
        },
        variazioneInvestimento: {
            title: 'Aumento investimento',
            dove: 'Ipotesi tua su quanto potrai aumentare il risparmio annuo nel tempo.',
            come: 'Puoi usare una percentuale o un importo fisso in euro: ogni 3 anni e aumento 10% significa aumento dell\'investimento ogni 3 anni.',
            effetto: 'Un budget crescente sposta più capitale negli anni finali, dove il confronto FP/PAC può cambiare.'
        },
        modalitaConfronto: {
            title: 'Modalità investimento',
            dove: 'Scelta di metodo, non un dato da recuperare: decide come confrontare FP e PAC.',
            come: 'Budget parte dall\'importo annuo pianificato e reinveste il risparmio fiscale l\'anno successivo. Netto confronta a parità di esborso effettivo: il PAC investe il costo netto equivalente del versamento FP, senza reinvestire il risparmio fiscale.',
            effetto: 'Con Budget il beneficio fiscale resta investito; con Netto ti rientra in tasca e il confronto è a parità di sacrificio.'
        },
        baseContributivaFpTipo: {
            title: 'Base quota aderente',
            dove: 'Scheda del fondo o CCNL: se parlano di minimo tabellare o paga base scegli Retribuzione minima, altrimenti lascia RAL.',
            come: 'È la base annua su cui si calcola la quota minima che devi versare per ottenere il contributo del datore.',
            effetto: 'Con la base sbagliata la quota minima stimata risulta troppo alta o troppo bassa.'
        },
        baseContributivaFp: {
            title: 'Minimo retributivo annuo',
            dove: 'CCNL: minimo tabellare o paga base mensile moltiplicati per le mensilità previste.',
            come: 'Usato come base annua per quota aderente e/o contributo datore quando scegli Retribuzione minima.',
            effetto: 'Se supera la RAL, il calcolatore mostra un avviso perché è un caso insolito.'
        },
        baseDatoreFpTipo: {
            title: 'Base contributo datore',
            dove: 'Scheda del fondo o CCNL, come per la base quota aderente.',
            come: 'Base annua su cui si calcola il contributo percentuale del datore: RAL oppure lo stesso minimo retributivo annuo indicato nello scenario.',
            effetto: 'La scelta cambia l\'importo del contributo datore stimato.'
        },
        variazioneBaseContributiva: {
            title: 'Aumento minimo retributivo',
            dove: 'Rinnovi del CCNL: aumenti previsti dei minimi tabellari.',
            come: 'Applica aumenti periodici al minimo retributivo annuo, con frequenza in anni e valore in percentuale o euro.',
            effetto: 'Se il minimo cresce, crescono anche quota minima richiesta e contributo datore.'
        },
        contribuzioneDatoreFpPerc: {
            title: 'Contributo datore di lavoro',
            dove: 'Scheda del fondo, CCNL o accordo aziendale.',
            come: 'Percentuale applicata alla base contributo datore, riconosciuta solo se versi almeno la quota minima aderente.',
            effetto: 'È capitale extra che il PAC non riceve: pesa molto nel confronto.'
        },
        quotaMinAderentePerc: {
            title: 'Quota minima aderente',
            dove: 'Scheda del fondo o CCNL: la percentuale minima richiesta all\'aderente, spesso su RAL, minimo retributivo o altra base contrattuale.',
            come: 'Il modello la usa per stabilire la quota FP minima da versare per agganciare il contributo datore.',
            effetto: 'Se non la versi, perdi il contributo aziendale.'
        },
        addizionaliPerc: {
            title: 'Addizionali manuali',
            dove: 'Busta paga (conguaglio) o dichiarazione dei redditi: somma tra aliquota media regionale e comunale. Esempio: 1,73% + 0,80% = 2,53%.',
            come: 'Il modello le somma all\'IRPEF nel calcolo dell\'imposta.',
            effetto: 'Aumentano anche il risparmio fiscale della deduzione. Se non vuoi calcolarle a mano, usa “Da località”.'
        },
        regioneAddizionali: {
            title: 'Regione addizionali',
            dove: 'La tua Regione o Provincia autonoma di residenza fiscale.',
            come: 'Applica le aliquote regionali importate dal CSV MEF.',
            effetto: 'Se selezioni anche il Comune, la Regione viene impostata automaticamente dalla provincia del Comune.'
        },
        comuneAddizionali: {
            title: 'Comune addizionali',
            dove: 'Il tuo Comune di residenza fiscale: digita nome, provincia o codice catastale e scegli dai risultati.',
            come: 'Aggiunge l\'addizionale comunale e imposta automaticamente la Regione.',
            effetto: 'Alcune note comunali particolari restano semplificate nel calcolo.'
        },
        contributiInpsPerc: {
            title: 'Aliquota INPS lavoratore',
            dove: 'Busta paga: di solito 9,19% per il dipendente ordinario, 9,49% l\'aliquota ordinaria maggiorata.',
            come: 'Dedotta dal reddito lordo prima di calcolare l\'IRPEF.',
            effetto: 'Incide su imponibile e risparmio fiscale. Cambia il default 9,19% solo se la tua busta paga riporta un\'aliquota diversa.'
        },
        contributiInpsPercManuale: {
            title: 'Aliquota manuale INPS',
            dove: 'Busta paga o simulazione consulenziale, per casi particolari.',
            come: 'Modificabile solo con preset su Manuale; usata come il preset, dedotta prima dell\'IRPEF.',
            effetto: 'Un\'aliquota più alta riduce l\'imponibile IRPEF e cambia leggermente il beneficio della deduzione.'
        },
        massimaleContributivoInps: {
            title: 'Massimale INPS',
            dove: 'Assunzione normativa del modello, non un input operativo.',
            come: 'Tetto annuo della base su cui si applicano i contributi INPS.',
            effetto: 'Sopra il massimale i contributi ordinari non crescono più.'
        },
        sogliaIvsAggiuntivo: {
            title: 'Soglia IVS aggiuntivo',
            dove: 'Assunzione normativa automatica del modello.',
            come: 'Soglia annua oltre la quale si applica il contributo IVS aggiuntivo.',
            effetto: 'Rileva solo per redditi sopra soglia.'
        },
        aliquotaIvsAggiuntivaPerc: {
            title: 'Aliquota IVS extra',
            dove: 'Assunzione normativa automatica del modello.',
            come: 'Aliquota aggiuntiva applicata alla quota di reddito sopra la soglia IVS.',
            effetto: 'Rileva solo per redditi sopra soglia.'
        },
        ulterioriDetrazioni: {
            title: 'Ulteriori detrazioni',
            dove: 'Dichiarazione dei redditi: bonus e detrazioni oltre a quelle da lavoro dipendente (es. spese sanitarie, interessi mutuo).',
            come: 'Riducono l\'imposta netta: non sono deduzioni, non abbassano il reddito imponibile.',
            effetto: 'Se sono alte riducono la capienza fiscale e quindi il beneficio effettivo della deduzione FP.'
        },
        modalitaVersamentoFp: {
            title: 'Versamento della quota FP extra',
            dove: 'Ufficio HR/payroll o fondo pensione: verifica quali canali di versamento sono ammessi.',
            come: 'La quota minima aderente passa sempre in busta per agganciare il contributo datore; l\'extra può andare in busta o via bonifico. Automatico sceglie la ripartizione più conveniente anno per anno.',
            effetto: 'Tutta la quota deducibile riduce l\'imponibile IRPEF, ma solo la quota in busta riduce la base usata per detrazioni da lavoro dipendente, ex Bonus Renzi e bonus cuneo.'
        },
        anzianitaPregressaFp: {
            title: 'Anzianità pregressa FP',
            dove: 'Area riservata del fondo: anni dalla prima adesione a forme pensionistiche complementari.',
            come: 'Anticipa la riduzione della tassazione in uscita dal 15% verso il 9%.',
            effetto: 'Non aggiunge un montante iniziale: conta solo per fiscalità in uscita.'
        },
        rendimentoAnnualeFpPerc: {
            title: 'Rendimento fondo pensione ipotizzato',
            dove: 'Rendimenti storici del comparto: scheda del fondo e confronti COVIP. Non sono previsioni.',
            come: 'Rendimento annuo usato nella simulazione FP: con Netto è usato così com\'è, con Lordo il modello sottrae costi annui e tassazione annuale.',
            effetto: 'Piccole differenze di rendimento cambiano molto il risultato su orizzonti lunghi.'
        },
        rendimentoFpMode: {
            title: 'Tipo rendimento FP',
            dove: 'Dipende da come hai stimato il rendimento: già al netto di costi e tassazione annuale, oppure lordo.',
            come: 'Con Lordo il FP applica la tassazione sui rendimenti ogni anno (12,5% quota agevolata, 20% il resto) e sottrae i costi annui.',
            effetto: 'Il calcolatore mostra il netto risultante, confrontabile con il PAC.'
        },
        costiAnnuiFpPerc: {
            title: 'Costi annui FP',
            dove: 'ISC nella scheda costi del fondo pensione.',
            come: 'Percentuale annua sottratta al montante FP quando il rendimento è impostato come lordo.',
            effetto: 'Più i costi sono alti, più il netto composto si riduce. Con rendimento netto lasciala a 0 per evitare doppio conteggio.'
        },
        quotaAgevolataFpPerc: {
            title: 'Quota FP agevolata 12,5%',
            dove: 'Composizione del comparto nella scheda del fondo: quota di titoli di Stato ed equiparati.',
            come: 'Quei rendimenti sono tassati al 12,5%, il resto al 20%; il calcolatore mostra l\'aliquota effettiva risultante.',
            effetto: 'Più quota agevolata significa meno tasse annue e rendimento netto più alto.'
        },
        rendimentoAnnualePacPerc: {
            title: 'Rendimento ETF ipotizzato',
            dove: 'Dati storici dell\'indice o KID dell\'ETF, con ipotesi prudente. Non è una previsione.',
            come: 'Rendimento annuo usato nella simulazione PAC: con Netto è usato così com\'è, con Lordo il modello sottrae costi annui e tassa le plusvalenze alla exit.',
            effetto: 'È la leva che più spesso decide il confronto con il FP.'
        },
        rendimentoPacMode: {
            title: 'Tipo rendimento PAC',
            dove: 'Dipende da come hai stimato il rendimento: già al netto di TER, bollo e fiscalità attesa, oppure lordo.',
            come: 'Con Lordo il modello applica costi annui e tassazione finale sulle plusvalenze (12,5% quota agevolata, 26% il resto, alla exit).',
            effetto: 'Il calcolatore mostra il netto risultante, confrontabile con il FP.'
        },
        costiAnnuiPacPerc: {
            title: 'Costi annui PAC',
            dove: 'TER nel KID dell\'ETF, più bollo e altri costi ricorrenti se non già inclusi nel rendimento.',
            come: 'Percentuale annua sottratta al montante PAC quando il rendimento è lordo.',
            effetto: 'Costi più alti riducono il rendimento netto composto anno dopo anno.'
        },
        quotaAgevolataPacPerc: {
            title: 'Quota PAC agevolata 12,5%',
            dove: 'Composizione dell\'ETF o del portafoglio: quota di titoli di Stato ed equiparati.',
            come: 'Quelle plusvalenze sono tassate al 12,5%, il resto al 26% alla exit; il calcolatore mostra l\'aliquota effettiva risultante.',
            effetto: 'Più quota agevolata significa meno tasse in uscita.'
        },
        riscattoAnticipato: {
            title: 'Riscatto anticipato',
            dove: 'Scelta di scenario: simula l\'uscita totale anticipata dal fondo pensione.',
            come: 'Applica al montante FP la tassazione del 23% invece dell\'ordinaria 15% che scende fino al 9%.',
            effetto: 'Non equivale alle anticipazioni parziali per sanità, casa o altre esigenze, che hanno regole proprie.'
        }
    };

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
    if (window.renderSiteIcons) window.renderSiteIcons();

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
