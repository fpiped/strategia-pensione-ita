/**
 * Calcolatore Fondo Pensione vs PAC - Scripts
 * Versione Dashboard
 */

document.addEventListener('DOMContentLoaded', function() {
    // Inizializza la navigazione a tab
    setupTabs();

    // Inizializza i comportamenti di scrolling
    setupScrolling();

    // Inizializza toggle risultati
    setupResultsToggle();

    // Inizializza tooltip mobile
    setupMobileTooltips();
});

/**
 * Inizializza il toggle per mostrare/nascondere la tabella risultati
 */
function setupResultsToggle() {
    // Toggle tabella
    const toggleResults = document.getElementById('toggle-results');
    const resultsSection = toggleResults?.closest('.results-section');

    if (toggleResults && resultsSection) {
        toggleResults.addEventListener('click', function() {
            resultsSection.classList.toggle('collapsed');
        });
    }

    // Toggle grafico
    const toggleChart = document.getElementById('toggle-chart');
    const chartSection = toggleChart?.closest('.chart-section');

    if (toggleChart && chartSection) {
        toggleChart.addEventListener('click', function() {
            chartSection.classList.toggle('collapsed');
        });
    }
}

/**
 * Inizializza la navigazione a tab
 */
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Rimuovi la classe active da tutti i tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            // Aggiungi la classe active al tab cliccato
            this.classList.add('active');

            // Nascondi tutti i contenuti dei tab
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            // Mostra il contenuto corrispondente
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`${tabId}-content`).classList.add('active');
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
    // Definizione help content
    const helpContent = {
        reddito: {
            title: 'Il tuo stipendio lordo',
            text: 'Il tuo Reddito Annuo Lordo (RAL). Serve per calcolare: 1) quanto risparmi di IRPEF versando nel fondo pensione (aliquota marginale 23-43%), 2) quanto versa il datore di lavoro come contributo aggiuntivo.'
        },
        durata: {
            title: 'Durata simulazione',
            text: 'Per quanti anni vuoi simulare l\'investimento. Più è lunga la durata, più si vedono gli effetti dell\'interesse composto. La tassazione FP scende dal 15% al 9% dopo 15 anni di partecipazione.'
        },
        investimento: {
            title: 'Quanto vuoi investire',
            text: 'L\'importo che vuoi investire volontariamente ogni anno. Non include il TFR. In modalità cumulativa viene versato ogni anno. Ricorda: il limite di deducibilità fiscale per il FP è €5.164,57/anno (incluso contributo datore, escluso TFR).'
        },
        contribuzioneDatoreFpPerc: {
            title: 'Contributo datore di lavoro',
            text: 'Percentuale del tuo reddito che l\'azienda versa nel tuo FP come benefit. È denaro aggiuntivo rispetto allo stipendio! Varia per contratto (es. metalmeccanici ~1.2-2%). Controlla il tuo CCNL o chiedi all\'HR.'
        },
        quotaMinAderentePerc: {
            title: 'Quota minima aderente',
            text: 'Per ricevere il contributo del datore, molti contratti richiedono che tu versi almeno una certa percentuale del tuo reddito. Se non la versi, perdi il contributo aziendale. Verifica sul tuo CCNL.'
        },
        addizionaliPerc: {
            title: 'Addizionali stimate',
            text: 'Percentuale manuale per stimare addizionale regionale e comunale. Il valore predefinito è una stima generica: puoi modificarlo se conosci la tua aliquota complessiva locale.'
        },
        ulterioriDetrazioni: {
            title: 'Ulteriori detrazioni',
            text: 'Importo annuo di altri bonus o detrazioni fiscali che riducono l’imposta netta. Non sono deduzioni: non abbassano il reddito imponibile, ma l’imposta da pagare.'
        },
        scenarioRendimento: {
            title: 'Scenario rendimenti',
            text: 'Imposta rapidamente coppie coerenti di rendimento FP/PAC. Prudente usa rendimenti bassi, Centrale usa i default della guida, Aggressivo aumenta il differenziale a favore del PAC. Scegli Personalizzato per modificare manualmente.'
        },
        compartoFp: {
            title: 'Comparto del fondo pensione',
            text: 'Il comparto determina come vengono investiti i tuoi soldi. Garantito: più prudente, basso rendimento atteso. Obbligazionario: principalmente bond. Bilanciato: mix azioni/bond. Azionario: più rischioso ma rendimento atteso maggiore. I valori sono ipotesi ispirate a dati storici, non garanzie.'
        },
        etfPreset: {
            title: 'Tipo di ETF per il PAC',
            text: 'ETF globali come MSCI World o FTSE All-World offrono ampia diversificazione. I LifeStrategy combinano azioni e obbligazioni in percentuali fisse. I rendimenti sono ipotesi di simulazione basate su dati storici e non sono garantiti.'
        },
        rendimentoAnnualeFpPerc: {
            title: 'Rendimento fondo pensione ipotizzato',
            text: 'Rendimento annuo usato nella simulazione FP. Il modello lo considera già netto dalla tassazione annuale dei rendimenti. Prova più valori: questo input influenza molto il breakeven.'
        },
        rendimentoAnnualePacPerc: {
            title: 'Rendimento ETF ipotizzato',
            text: 'Rendimento annuo usato nella simulazione PAC. Il modello tassa le plusvalenze al 26% solo all’uscita. Non è una previsione: rendimenti più bassi o più alti cambiano molto il risultato finale.'
        },
        modalitaCumulativa: {
            title: 'Modalità cumulativa',
            text: 'Cumulativo ON: versi l\'importo ogni anno e vedi l\'accumulo totale nel tempo (scenario realistico di un PAC). Cumulativo OFF: simula un singolo versamento e la sua evoluzione, utile per capire l\'effetto del rendimento composto.'
        },
        reinvestiRisparmio: {
            title: 'Reinvesti risparmio fiscale',
            text: 'Reinvesti ON: il risparmio IRPEF ottenuto dalla deduzione viene reinvestito nel FP l\'anno successivo, massimizzando l\'effetto composto. Reinvesti OFF: il risparmio viene tenuto da parte e sommato al valore finale.'
        },
        riscattoAnticipato: {
            title: 'Riscatto anticipato',
            text: 'Se prevedi di riscattare tutto il FP prima della pensione (es. per acquisto casa, spese sanitarie), la tassazione è fissa al 23%. Altrimenti, a scadenza la tassazione è 15% e scende dello 0.3%/anno fino al 9% dopo 35 anni.'
        },
        mostraDettaglio: {
            title: 'Mostra dettaglio tabella',
            text: 'Dettaglio ON: mostra tutte le colonne intermedie (versato, rendimento, tasse, contributo datore, ecc.). Dettaglio OFF: mostra solo Anno e i valori Exit finali per una vista più compatta.'
        }
    };

    // Crea modal
    const modal = document.createElement('div');
    modal.className = 'help-modal';
    modal.innerHTML = `
        <div class="help-modal-backdrop"></div>
        <div class="help-modal-content">
            <div class="help-modal-header">
                <div class="help-modal-icon"><i class="fas fa-circle-info"></i></div>
                <div class="help-modal-title"></div>
                <button type="button" class="help-modal-close" aria-label="Chiudi">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>
            <div class="help-modal-text"></div>
        </div>
    `;
    document.body.appendChild(modal);

    const modalTitle = modal.querySelector('.help-modal-title');
    const modalText = modal.querySelector('.help-modal-text');

    function closeModal() {
        modal.classList.remove('active');
    }

    function openModal(helpId) {
        const help = helpContent[helpId];
        if (!help) return;

        modalTitle.textContent = help.title;
        modalText.textContent = help.text;
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
