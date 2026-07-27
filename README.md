# Strategia Pensione

Web app per confrontare quanto conviene versare in un fondo pensione e quanto destinare a un PAC, nel contesto fiscale italiano.

Demo: https://strategiapensione.it/

## Perche esiste

La scelta tra fondo pensione e PAC non e solo una questione di rendimento atteso. Nel fondo pensione entrano in gioco deduzione fiscale, contributo del datore, tassazione in uscita, costi e vincoli previdenziali. Nel PAC entrano invece flessibilita, tassazione finanziaria e rendimento composto.

Strategia Pensione nasce per rendere questo confronto leggibile anno per anno: dato un budget annuale, il simulatore stima se conviene metterlo nel fondo pensione, nel PAC o dividerlo tra le due soluzioni.

Non e uno strumento di consulenza finanziaria, fiscale o previdenziale. Serve a esplorare scenari e capire quali variabili pesano davvero sul risultato.

## Come funziona

Il calcolatore parte dagli input principali: durata, retribuzione, budget annuo a carico dell'utente, quote di contribuzione, contributo del datore, addizionali, rendimenti, costi e tassazione.

L'allocazione consigliata viene confrontata a parità di budget personale con quattro strategie:

- allocazione ottimizzata sequenzialmente tra fondo pensione e PAC;
- tutto PAC;
- minimo fondo pensione necessario a ottenere il contributo del datore, poi PAC;
- massimo fondo pensione senza PAC.

Il budget soddisfa sempre l'identità `FP personale + PAC + liquidità − beneficio fiscale = budget personale`. Poiché soglie e detrazioni possono rendere discontinua la funzione fiscale, non si presume che esista sempre una quota FP con costo netto esattamente uguale al budget: nel benchmark massimo FP viene scelta la massima quota sostenibile e l'eventuale residuo resta liquidità nominale a rendimento zero.

Il risultato finale mostra il valore netto stimato, il TIR, la sequenza annuale delle scelte, i benchmark e il dettaglio dei fattori che hanno inciso sul confronto. Una frontiera annuale permette inoltre di provare una quota FP personale e osservare PAC derivato, beneficio, datore e valore proiettato.

La logica e pensata per lavoratori dipendenti. Non include il TFR e non modella casi previdenziali individuali complessi.

### Limite deliberato sui rendimenti negativi

Il modello accetta per FP e PAC soltanto rendimenti annui pari o superiori a 0%. Questa è una scelta esplicita di perimetro: la simulazione non considera anni di perdita sui mercati, il riporto fiscale delle perdite del fondo pensione, minusvalenze o compensazioni del PAC. Le eventuali erosioni del montante rappresentate dall'app derivano esclusivamente dai costi inseriti.

### Altre approssimazioni deliberate

- Il massimale contributivo INPS 2026 viene applicato a tutti gli scenari, anche se nella realtà dipende dalla posizione contributiva individuale.
- Oltre 200.000 euro, la riduzione di 440 euro viene applicata alle detrazioni aggregate inserite, senza distinguere gli oneri interessati e le categorie escluse.
- L’allocazione viene ottimizzata sequenzialmente anno per anno: ogni quota è proiettata fino all’orizzonte residuo, ma senza anticipare i versamenti futuri. Nel perimetro attuale questo limite riguarda soprattutto i costi fissi annui di FP e PAC, che i versamenti successivi potrebbero ammortizzare; non è quindi garantito l’ottimo globale dell’intero piano.
- La liquidità residua del benchmark massimo FP è mantenuta nominale e non produce rendimento.

## Avvio locale

Prerequisiti:

- Node.js;
- un browser moderno.

```bash
git clone https://github.com/fpiped/strategia-pensione-ita.git
cd strategia-pensione-ita
npm start
```

Poi apri:

```text
http://localhost:9000
```

Alternativa senza `npm`:

```bash
python3 -m http.server 9000
```

Non aprire direttamente `index.html` come file locale: l'app usa moduli ES e va servita da un server statico.

## Test

```bash
npm test
```

I test usano il runner nativo di Node.js e coprono la logica principale di calcolo, la fiscalità dell'esploratore annuale, i benchmark, i salti fiscali, la riconciliazione del budget e la completezza del registro metodologico.

### Test end-to-end

Coprono controller, binding e view guidando l'app in un browser headless (persistenza dello scenario, link di condivisione, rendering di tabella ed esploratore, assenza di richieste a host esterni, specularità dei temi: per ogni coppia di elementi, uguali in light ⟺ uguali in dark). Richiedono una tantum:

```bash
npm install
npx playwright install chromium
```

Poi:

```bash
npm run test:e2e
```

## Dati e dipendenze

Il progetto e una single-page app statica in HTML, CSS e JavaScript vanilla.

Chart.js e i font (Inter per l'interfaccia, IBM Plex Mono per i numeri) sono vendorizzati in `vendor/`; le icone sono un sottoinsieme di Lucide reso inline nel modulo `js/icons.js`; l'illustrazione vettoriale del masthead (`vendor/img/mascotte.svg`) usa colori con contrasto stabile nei due temi. La pagina non fa richieste a servizi o CDN esterni. Le aliquote regionali e comunali sono incluse come dataset locale normalizzato; le comunali (`js/constants/local-tax-data.js`, ~700 KB) si caricano con `import()` dinamico solo quando serve la modalità "Da località". Il repository non contiene una pipeline di import o scraping dei dati sorgente.

Le regole fiscali nazionali sono centralizzate e versionate per anno in `js/constants/fiscal-rules.js`. La stessa configurazione alimenta formule, valori predefiniti e l'elenco delle fonti nella pagina Informazioni, evitando duplicazioni tra modello e documentazione.

Le decisioni di modello sono separate dalle norme e raccolte nel registro versionato `js/constants/calculation-methodology.js`. Ogni nucleo dichiara ID stabile, formula, decisione, motivazione, fonti normative collegate, approssimazioni e punti di implementazione. Le righe annuali, le strategie e la frontiera espongono inoltre una traccia tecnica non enumerabile (`_audit`) che collega valori esatti e versione metodologica senza alterare CSV o link condivisi.

## Design system

L'interfaccia segue il design system "Registro": tutti i colori vivono come token (`--ds-*`) nel layer canonico in fondo a `styles.css`, con due palette (chiara e scura) sugli stessi binding — un componente non può avere binding diversi nei due temi, e il test e2e di specularità lo garantisce. Il colore-firma `--ds-brand` (verde acqua) è identico nei due temi e si usa solo come riempimento con testo inchiostro sopra; i colori-dato (FP blu, PAC ambra, MIX verde) colorano esclusivamente dati. Raggi in scala 8/4/2, pesi tipografici 400-800, ogni cifra calcolata è in Plex Mono con `tabular-nums`.

La compilazione guidata procede in 15 passi monotematici e si chiude con Escape, X o click sul fondo.

## Licenza

MIT
