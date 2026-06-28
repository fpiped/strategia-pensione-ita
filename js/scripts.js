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
            title: 'Reddito annuo',
            text: 'La tua retribuzione annua lorda ordinaria da lavoratore dipendente. Se scegli RAL come base, il modello usa questo importo per calcolare quota minima aderente e contributo datore. Non è pensato per autonomi, partite IVA o regimi sostitutivi.'
        },
        premiStraordinari: {
            title: 'Premi, straordinari e bonus',
            text: 'Altri compensi annui imponibili INPS/IRPEF. Nel modello aumentano reddito fiscale e previdenziale, ma non la base su cui si calcolano quota minima FP e contributo datore.'
        },
        variazioneReddito: {
            title: 'Aumento reddito',
            text: 'Simula aumenti periodici del reddito annuo ordinario. “Ogni anni” indica ogni quanti anni applicare la variazione: con ogni 3 anni e aumento 5%, il reddito resta uguale per 3 anni e aumenta del 5% dal quarto, poi di nuovo dal settimo.'
        },
        durata: {
            title: 'Durata simulazione',
            text: 'Per quanti anni vuoi simulare l\'investimento. Più è lunga la durata, più si vedono gli effetti dell\'interesse composto. La tassazione FP scende dal 15% al 9% dopo 15 anni di partecipazione.'
        },
        investimento: {
            title: 'Investimento annuo',
            text: 'L\'importo che vuoi allocare ogni anno tra fondo pensione e PAC. La quota oltre il limite deducibile viene considerata sempre PAC. Non include il TFR. Ricorda: il limite di deducibilità fiscale per il FP è €5.164,57/anno (incluso contributo datore, escluso TFR).'
        },
        variazioneInvestimento: {
            title: 'Aumento investimento',
            text: 'Simula aumenti periodici dell’investimento annuo. Puoi usare una percentuale o un importo fisso in euro. Ogni 3 anni e aumento 10% significa aumento dell’investimento ogni 3 anni.'
        },
        modalitaConfronto: {
            title: 'Modalità investimento',
            text: 'Budget lordo confronta lo stesso importo annuo allocato tra FP e PAC e reinveste il risparmio fiscale l’anno successivo. Sacrificio netto confronta invece a parità di impatto sul reddito netto: il PAC investe il costo netto equivalente del versamento FP, senza reinvestire di nuovo il risparmio fiscale.'
        },
        baseContributivaFpTipo: {
            title: 'Base quota aderente',
            text: 'Base annua su cui calcolare la quota minima che devi versare per ottenere il contributo del datore.'
        },
        baseContributivaFp: {
            title: 'Minimo retributivo annuo',
            text: 'Valore annuo del minimo tabellare o retributivo indicato dal CCNL, se quota aderente o contributo datore sono calcolati su questa base invece che sulla RAL. Usa il minimo mensile moltiplicato per le mensilità previste. Se supera la RAL, il calcolatore mostra un avviso perché è insolito.'
        },
        baseDatoreFpTipo: {
            title: 'Base contributo datore',
            text: 'Base annua su cui calcolare il contributo percentuale del datore: reddito annuo/RAL oppure minimo retributivo annuo. Se scegli minimo, viene usato lo stesso minimo retributivo annuo indicato nello scenario.'
        },
        variazioneBaseContributiva: {
            title: 'Aumento minimo retributivo',
            text: 'Simula aumenti periodici del minimo retributivo annuo. Serve se quota minima aderente o contributo datore sono calcolati sul minimo tabellare del CCNL.'
        },
        contribuzioneDatoreFpPerc: {
            title: 'Contributo datore di lavoro',
            text: 'Percentuale che l’azienda versa nel tuo fondo pensione. Viene applicata alla base contributo datore: RAL oppure minimo retributivo annuo.'
        },
        quotaMinAderentePerc: {
            title: 'Quota minima aderente',
            text: 'Per ricevere il contributo del datore, molti contratti richiedono che tu versi almeno una certa percentuale di un importo definito dal fondo o dal CCNL: spesso RAL, minimo retributivo o altra base contrattuale. Se non la versi, perdi il contributo aziendale.'
        },
        addizionaliPerc: {
            title: 'Addizionali manuali',
            text: 'Inserisci la somma tra aliquota media regionale e aliquota media comunale. Esempio: regionale 1,73% + comunale 0,80% = 2,53%. Se non vuoi calcolarla a mano, usa “Da località”.'
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
            title: 'Aliquota INPS lavoratore',
            text: 'Aliquota previdenziale ordinaria a carico del lavoratore. Usa il preset più vicino alla tua busta paga; passa a manuale solo se hai un dato specifico.'
        },
        contributiInpsPercManuale: {
            title: 'Aliquota manuale INPS',
            text: 'Campo modificabile solo se scegli Manuale nel preset INPS. Serve per casi particolari ricavati dalla busta paga o da una simulazione consulenziale.'
        },
        massimaleContributivoInps: {
            title: 'Massimale INPS',
            text: 'Tetto annuo della base su cui applicare i contributi INPS nel modello. È trattato come assunzione normativa, non come input operativo.'
        },
        sogliaIvsAggiuntivo: {
            title: 'Soglia IVS aggiuntivo',
            text: 'Soglia annua oltre la quale si applica il contributo IVS aggiuntivo. È un’assunzione normativa automatica del modello.'
        },
        aliquotaIvsAggiuntivaPerc: {
            title: 'Aliquota IVS extra',
            text: 'Aliquota aggiuntiva applicata alla quota di reddito sopra la soglia IVS. È un’assunzione normativa automatica del modello.'
        },
        ulterioriDetrazioni: {
            title: 'Ulteriori detrazioni',
            text: 'Importo annuo di altri bonus o detrazioni fiscali che riducono l’imposta netta. Non sono deduzioni: non abbassano il reddito imponibile, ma l’imposta da pagare.'
        },
        modalitaVersamentoFp: {
            title: 'Versamento FP',
            text: 'Decide quanta quota FP viene trattata come versamento tramite busta paga. La quota minima aderente deve passare in busta per agganciare il contributo datore; l’extra può essere ottimizzato tra busta e bonifico. Tutta la quota deducibile riduce l’imponibile IRPEF, ma solo la quota in busta paga riduce la base usata per stimare detrazioni da lavoro dipendente, ex Bonus Renzi e bonus cuneo fiscale.'
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
        rendimentoAnnualeFpPerc: {
            title: 'Rendimento fondo pensione ipotizzato',
            text: 'Rendimento annuo usato nella simulazione FP. Puoi stimarlo dai rendimenti storici del comparto, ricordando che non sono previsioni. Se scegli netto viene usato così com’è; se scegli lordo, il modello sottrae costi annui e tassazione annuale.'
        },
        rendimentoFpMode: {
            title: 'Tipo rendimento FP',
            text: 'Usa netto se il valore è già al netto di costi e tassazione annuale. Usa lordo se vuoi inserire rendimento prima di costi e tasse: il FP applica la tassazione sui rendimenti ogni anno.'
        },
        costiAnnuiFpPerc: {
            title: 'Costi annui FP',
            text: 'Percentuale annua sottratta al montante del fondo pensione quando il rendimento FP è impostato come lordo. Se usi rendimento netto, lasciala a 0 per evitare doppio conteggio.'
        },
        quotaAgevolataFpPerc: {
            title: 'Quota FP agevolata 12,5%',
            text: 'Quota dei rendimenti FP riconducibile a strumenti tassati al 12,5%, tipicamente titoli di Stato ed equiparati. Il resto è tassato al 20%. Il calcolatore mostra l’aliquota effettiva risultante.'
        },
        rendimentoAnnualePacPerc: {
            title: 'Rendimento ETF ipotizzato',
            text: 'Rendimento annuo usato nella simulazione PAC. Puoi stimarlo da dati storici o altri strumenti, con ipotesi prudente. Se scegli netto viene usato così com’è; se scegli lordo, il modello sottrae costi annui e tassa le plusvalenze alla exit.'
        },
        rendimentoPacMode: {
            title: 'Tipo rendimento PAC',
            text: 'Usa netto se il rendimento è già al netto di TER, bollo e fiscalità attesa. Usa lordo se vuoi far applicare al modello costi annui e tassazione finale sulle plusvalenze.'
        },
        costiAnnuiPacPerc: {
            title: 'Costi annui PAC',
            text: 'Percentuale annua sottratta al montante PAC quando il rendimento PAC è lordo. Può rappresentare TER, bollo o altri costi ricorrenti se non li hai già inclusi nel rendimento.'
        },
        quotaAgevolataPacPerc: {
            title: 'Quota PAC agevolata 12,5%',
            text: 'Quota delle plusvalenze PAC riconducibile a strumenti tassati al 12,5%, tipicamente titoli di Stato ed equiparati. Il resto è tassato al 26%. Il calcolatore mostra l’aliquota effettiva risultante.'
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
