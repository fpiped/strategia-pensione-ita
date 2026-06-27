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
            text: 'Il tuo Reddito Annuo Lordo (RAL) da lavoratore dipendente. Il modello usa contributi INPS stimati, detrazioni da lavoro dipendente e possibile contributo del datore. Non è pensato per autonomi, partite IVA o regimi sostitutivi.'
        },
        variazioneReddito: {
            title: 'Variazione reddito',
            text: 'Simula aumenti periodici della RAL. Freq. indica ogni quanti anni applicare la variazione: con freq. 3 e valore 5%, il reddito resta uguale per 3 anni e aumenta del 5% dal quarto anno, poi di nuovo dal settimo.'
        },
        durata: {
            title: 'Durata simulazione',
            text: 'Per quanti anni vuoi simulare l\'investimento. Più è lunga la durata, più si vedono gli effetti dell\'interesse composto. La tassazione FP scende dal 15% al 9% dopo 15 anni di partecipazione.'
        },
        investimento: {
            title: 'Budget annuo',
            text: 'L\'importo che vuoi allocare ogni anno tra fondo pensione e PAC. La quota oltre il limite deducibile viene considerata sempre PAC. Non include il TFR. Ricorda: il limite di deducibilità fiscale per il FP è €5.164,57/anno (incluso contributo datore, escluso TFR).'
        },
        variazioneInvestimento: {
            title: 'Variazione investimento',
            text: 'Simula aumenti periodici del budget annuo. Puoi usare una percentuale o un importo fisso in euro. Freq. 3 e valore 10% significa aumento del budget ogni 3 anni.'
        },
        modalitaConfronto: {
            title: 'Modalità confronto',
            text: 'Budget lordo confronta lo stesso importo annuo allocato tra FP e PAC e reinveste il risparmio fiscale l’anno successivo. Sacrificio netto confronta invece a parità di impatto sul reddito netto: il PAC investe il costo netto equivalente del versamento FP, senza reinvestire di nuovo il risparmio fiscale.'
        },
        baseContributivaFpTipo: {
            title: 'Base contributi FP',
            text: 'Base annua su cui calcolare quota minima aderente e contributo datore. Può essere RAL, base TFR/imponibile TFR, minimo retributivo annuo o un importo manuale indicato dal tuo CCNL/fondo.'
        },
        baseContributivaFp: {
            title: 'Base annua alternativa',
            text: 'Inserisci il valore annuo della base contributiva se il fondo non usa la RAL. Per esempio imponibile TFR annuo o minimo retributivo mensile moltiplicato per le mensilità previste. Il valore viene limitato alla RAL.'
        },
        variazioneBaseContributiva: {
            title: 'Variazione base contributi',
            text: 'Simula aumenti periodici della base alternativa usata per contributo datore e quota minima. Se la base è RAL, questa variazione resta disattivata perché si usa già la variazione reddito.'
        },
        contribuzioneDatoreFpPerc: {
            title: 'Contributo datore di lavoro',
            text: 'Percentuale che l\'azienda versa nel tuo FP come benefit. Viene applicata alla base contributi FP selezionata, non necessariamente alla RAL. Si somma all’eventuale contributo fisso annuo.'
        },
        contributoDatoreFisso: {
            title: 'Datore fisso annuo',
            text: 'Importo annuo fisso che il datore versa nel fondo pensione, se previsto dal fondo o dall’accordo aziendale. Si somma al contributo percentuale e conta nel limite deducibile.'
        },
        quotaMinAderentePerc: {
            title: 'Quota minima aderente',
            text: 'Per ricevere il contributo del datore, molti contratti richiedono che tu versi almeno una certa percentuale della base contributi FP. Se non la versi, perdi il contributo aziendale. Verifica sul tuo CCNL.'
        },
        addizionaliPerc: {
            title: 'Addizionali stimate',
            text: 'Percentuale usata per stimare addizionale regionale e comunale. In modalità manuale puoi modificarla direttamente; in modalità da località mostra il risultato calcolato da Regione e Comune.'
        },
        regioneAddizionali: {
            title: 'Regione addizionali',
            text: 'Seleziona la Regione o Provincia autonoma per usare le aliquote regionali importate dal CSV MEF. Se selezioni anche il Comune, la Regione viene impostata automaticamente dalla provincia del Comune.'
        },
        comuneAddizionali: {
            title: 'Comune addizionali',
            text: 'Digita nome, provincia o codice catastale e scegli il Comune dai risultati. Il Comune aggiunge l’addizionale comunale e imposta automaticamente la Regione. Alcune note comunali particolari restano semplificate nel calcolo.'
        },
        contributiInpsPerc: {
            title: 'Contributi INPS',
            text: 'Aliquota previdenziale ordinaria a carico del lavoratore. Il modello la applica fino al massimale contributivo INPS per stimare l’imponibile IRPEF.'
        },
        massimaleContributivoInps: {
            title: 'Massimale INPS',
            text: 'Tetto annuo della base su cui applicare i contributi INPS nel modello. Sopra questo valore non vengono stimati contributi ordinari o IVS aggiuntivi.'
        },
        sogliaIvsAggiuntivo: {
            title: 'Soglia IVS aggiuntivo',
            text: 'Soglia annua oltre la quale si applica il contributo IVS aggiuntivo. Il modello lo calcola solo sulla quota sopra soglia e comunque entro il massimale INPS.'
        },
        aliquotaIvsAggiuntivaPerc: {
            title: 'Aliquota IVS extra',
            text: 'Aliquota aggiuntiva applicata alla quota di reddito sopra la soglia IVS. Di norma è l’1%, ma puoi modificarla se hai un dato diverso.'
        },
        ulterioriDetrazioni: {
            title: 'Ulteriori detrazioni',
            text: 'Importo annuo di altri bonus o detrazioni fiscali che riducono l’imposta netta. Non sono deduzioni: non abbassano il reddito imponibile, ma l’imposta da pagare.'
        },
        modalitaVersamentoFp: {
            title: 'Versamento FP',
            text: 'Decide quanta quota FP viene trattata come versamento tramite busta paga. Tutta la quota deducibile riduce l’imponibile IRPEF, ma solo la quota in busta paga riduce la base usata per stimare detrazioni da lavoro dipendente e trattamento integrativo.'
        },
        trattamentoIntegrativoAttivo: {
            title: 'Trattamento integrativo',
            text: 'Stima opzionale e semplificata dell’ex Bonus Renzi. Se attivo, il modello riconosce l’importo annuo quando la base per detrazioni rientra tra soglia minima e massima.'
        },
        trattamentoIntegrativoImporto: {
            title: 'Importo trattamento',
            text: 'Importo annuo da riconoscere quando il reddito stimato rientra nelle soglie indicate. Modificalo se vuoi simulare una regola diversa.'
        },
        trattamentoIntegrativoSogliaMin: {
            title: 'Soglia minima trattamento',
            text: 'Soglia sotto la quale il trattamento integrativo non viene stimato. È configurabile perché le regole fiscali possono cambiare.'
        },
        trattamentoIntegrativoSogliaMax: {
            title: 'Soglia massima trattamento',
            text: 'Soglia sopra la quale il trattamento integrativo non viene stimato nel modello semplificato. La quota FP in busta paga può abbassare la base usata per questo controllo.'
        },
        anzianitaPregressaFp: {
            title: 'Anzianità pregressa FP',
            text: 'Anni di partecipazione a forme pensionistiche complementari già maturati prima della simulazione. Anticipano la riduzione della tassazione in uscita dal 15% al 9%, ma non aggiungono un montante iniziale.'
        },
        primaOccupazionePost2006: {
            title: 'Prima occupazione post 2006',
            text: 'Attiva questa opzione se la tua prima occupazione è successiva al 31/12/2006 e sei nel periodo in cui puoi recuperare deduzione non usata nei primi 5 anni di partecipazione al fondo pensione.'
        },
        plafondExtraPrimaOccupazione: {
            title: 'Plafond extra residuo',
            text: 'Quota di deduzione aggiuntiva ancora recuperabile. Si calcola come 25.822,85 € meno i contributi effettivamente versati nei primi 5 anni di partecipazione. Ogni anno puoi usare al massimo 2.582,29 € extra.'
        },
        anniResiduiMaggiorazione: {
            title: 'Anni residui maggiorazione',
            text: 'Numero di anni ancora disponibili per usare il plafond extra. La normativa consente il recupero nei 20 anni successivi ai primi 5 anni di partecipazione.'
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
            text: 'Rendimento annuo usato nella simulazione FP. Il modello lo considera già netto dalla tassazione annuale dei rendimenti. Prova più valori: questo input influenza molto il mix consigliato.'
        },
        rendimentoAnnualePacPerc: {
            title: 'Rendimento ETF ipotizzato',
            text: 'Rendimento annuo usato nella simulazione PAC. Il modello tassa le plusvalenze al 26% solo all’uscita. Non è una previsione: rendimenti più bassi o più alti cambiano molto il risultato finale.'
        },
        riscattoAnticipato: {
            title: 'Riscatto anticipato',
            text: 'Simula un riscatto totale anticipato con tassazione al 23%. Non è la stessa cosa delle anticipazioni parziali per sanità, casa o ulteriori esigenze. Se OFF, usa la tassazione ordinaria 15% che scende fino al 9%.'
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
