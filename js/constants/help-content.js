/**
 * Contenuti dell'aiuto contestuale: fonte unica per i popover del
 * pannello e per le note della modalità guidata. Ogni voce risponde a
 * tre domande (dove si trova, come viene usata, cosa comporta).
 */
export const HELP_CONTENT = {
        reddito: {
            title: 'RAL',
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
            dove: 'L\'importo personale lordo che vuoi allocare ogni anno tra fondo pensione e PAC, TFR escluso.',
            come: 'La quota oltre il limite deducibile di 5.300 €/anno (incluso contributo datore, escluso TFR) viene considerata sempre PAC.',
            effetto: 'Importi più alti saturano prima la deduzione; il beneficio fiscale riduce l’investimento netto ma non aumenta l’investimento lordo indicato.'
        },
        variazioneInvestimento: {
            title: 'Aumento investimento',
            dove: 'Ipotesi tua su quanto potrai aumentare il risparmio annuo nel tempo.',
            come: 'Puoi usare una percentuale o un importo fisso in euro: ogni 3 anni e aumento 10% significa aumento dell\'investimento ogni 3 anni.',
            effetto: 'Un budget crescente sposta più capitale negli anni finali, dove il confronto FP/PAC può cambiare.'
        },
        baseContributivaFpTipo: {
            title: 'Base quota aderente',
            dove: 'Controlla la scheda “Contribuzione” del fondo, il CCNL o l’accordo aziendale. Cerca la frase che accompagna la percentuale: può indicare RAL, retribuzione utile TFR, minimo contrattuale, paga base oppure una specifica somma di elementi della busta paga. Se non indica chiaramente la RAL, scegli Altra base.',
            come: 'È l’importo annuo a cui viene applicata la percentuale minima dell’aderente. Esempio: quota 1% su RAL 35.000 € = 350 €; su altra base 30.000 € = 300 €. Raggiungere questa quota è normalmente necessario per ottenere il contributo del datore.',
            effetto: 'Questa scelta riguarda solo il calcolo della quota minima FP: non modifica la RAL usata per IRPEF e INPS. La base del datore può essere scelta separatamente.'
        },
        baseContributivaFp: {
            title: 'Altra base retributiva',
            dove: 'Inserisci il valore annuo indicato dal fondo, CCNL o accordo aziendale. Puoi trovarlo nella tabella delle contribuzioni, nella nota sotto le percentuali o nelle voci retributive della busta paga. Se la base è mensile, moltiplicala solo per le mensilità previste dalla regola: non assumere automaticamente 13 o 14.',
            come: 'Esempi possibili: minimo tabellare del livello; paga base; paga base + contingenza + EDR; retribuzione utile ai fini TFR; retribuzione pensionabile; imponibile convenzionale; somma di specifiche voci fisse prevista dal CCNL; retribuzione fissa con esclusione di premi, straordinari e altre componenti variabili. Usa la definizione esatta del tuo fondo: basi con nomi simili possono includere elementi diversi.',
            effetto: 'È un unico importo condiviso quando Base aderente e/o Base datore sono su Altra base. Non aggiunge reddito, non cambia IRPEF o INPS e non simula il TFR: serve soltanto come moltiplicatore delle percentuali FP. Esempio: 30.000 € × quota datore 1,5% = 450 €.'
        },
        baseDatoreFpTipo: {
            title: 'Base contributo datore',
            dove: 'Controlla la regola specifica del contributo aziendale nella scheda del fondo, nel CCNL o nell’accordo aziendale. Non dedurla dalla base aderente: il datore può applicare la propria percentuale alla RAL, alla retribuzione utile TFR, al minimo contrattuale o a un’altra base espressamente definita.',
            come: 'Con RAL, la percentuale del datore si applica alla RAL. Con Altra base, si applica al valore inserito nel campo dedicato. Esempio: 1,5% su 35.000 € = 525 €; su 30.000 € = 450 €.',
            effetto: 'Il contributo viene riconosciuto solo quando versi almeno la quota minima aderente. È capitale aggiuntivo del datore: non aumenta la tua spesa personale, ma occupa parte del limite deducibile.'
        },
        variazioneBaseContributiva: {
            title: 'Aumento altra base',
            dove: 'Rinnovi del CCNL o variazioni previste della base contributiva scelta.',
            come: 'Applica aumenti periodici all’altra base retributiva, con frequenza in anni e valore in percentuale o euro.',
            effetto: 'Se la base cresce, crescono anche quota minima richiesta e contributo datore.'
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
            title: 'Costi annui % FP',
            dove: 'ISC nella scheda costi del fondo pensione.',
            come: 'Percentuale annua sottratta al montante FP quando il rendimento è impostato come lordo.',
            effetto: 'Più i costi sono alti, più il netto composto si riduce. Con rendimento netto lasciala a 0 per evitare doppio conteggio.'
        },
        costiFissiFp: {
            title: 'Costi annui EUR FP',
            dove: 'Scheda costi del fondo: quota associativa, spese amministrative o altre commissioni espresse in euro.',
            come: 'Importo sottratto una volta per ogni anno in cui il FP è attivo. Si applica solo con rendimento Lordo.',
            effetto: 'Pesa soprattutto sui montanti piccoli. Non inserirlo se è già incluso nel rendimento netto.'
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
            title: 'Costi annui % PAC',
            dove: 'TER nel KID dell\'ETF, più bollo e altri costi ricorrenti se non già inclusi nel rendimento.',
            come: 'Percentuale annua sottratta al montante PAC quando il rendimento è lordo.',
            effetto: 'Costi più alti riducono il rendimento netto composto anno dopo anno.'
        },
        costiFissiPac: {
            title: 'Costi annui EUR PAC',
            dove: 'Canone del broker, commissioni minime e altri costi ricorrenti espressi in euro.',
            come: 'Importo sottratto una volta per ogni anno in cui il PAC è attivo. Nel costo percentuale includi invece TER, bollo e altri costi proporzionali.',
            effetto: 'Pesa soprattutto sui PAC piccoli. Non inserirlo se è già incluso nel rendimento netto.'
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
