# Strategia Pensione

Web app per confrontare quanto conviene versare in un fondo pensione e quanto destinare a un PAC, nel contesto fiscale italiano.

Demo: https://strategiapensione.it/

## Perche esiste

La scelta tra fondo pensione e PAC non e solo una questione di rendimento atteso. Nel fondo pensione entrano in gioco deduzione fiscale, contributo del datore, tassazione in uscita, costi e vincoli previdenziali. Nel PAC entrano invece flessibilita, tassazione finanziaria e rendimento composto.

Strategia Pensione nasce per rendere questo confronto leggibile anno per anno: dato un budget annuale, il simulatore stima se conviene metterlo nel fondo pensione, nel PAC o dividerlo tra le due soluzioni.

Non e uno strumento di consulenza finanziaria, fiscale o previdenziale. Serve a esplorare scenari e capire quali variabili pesano davvero sul risultato.

## Come funziona

Il calcolatore parte dagli input principali: durata, retribuzione, investimento annuo, quote di contribuzione, contributo del datore, addizionali, rendimenti, costi e tassazione.

Per ogni anno simula tre strategie:

- fondo pensione fino alla quota fiscalmente conveniente;
- PAC;
- allocazione ottimale tra fondo pensione e PAC.

Il risultato finale mostra il valore netto stimato, la sequenza annuale delle scelte e il dettaglio dei fattori che hanno inciso sul confronto.

La logica e pensata per lavoratori dipendenti. Non include il TFR e non modella casi previdenziali individuali complessi.

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

I test usano il runner nativo di Node.js e coprono la logica principale di calcolo, inclusa la fiscalità dell'esploratore annuale (`buildAnnualExplorerData`).

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

Chart.js e i font (Inter per l'interfaccia, IBM Plex Mono per i numeri) sono vendorizzati in `vendor/`; le icone sono un sottoinsieme di Lucide reso inline nel modulo `js/icons.js`; l'immagine dell'hero è in `vendor/img/hero.webp`. La pagina non fa richieste a CDN esterne (l'unica chiamata a terzi e il contatore visite di counterapi.dev). Le aliquote regionali e comunali sono incluse come dataset locale normalizzato; le comunali (`js/constants/local-tax-data.js`, ~700 KB) si caricano con `import()` dinamico solo quando serve la modalità "Da località". Il repository non contiene una pipeline di import o scraping dei dati sorgente.

## Design system

L'interfaccia segue il design system "Registro": tutti i colori vivono come token (`--ds-*`) nel layer canonico in fondo a `styles.css`, con due palette (chiara e scura) sugli stessi binding — un componente non può avere binding diversi nei due temi, e il test e2e di specularità lo garantisce. Il colore-firma `--ds-brand` (verde acqua) è identico nei due temi e si usa solo come riempimento con testo inchiostro sopra; i colori-dato (FP blu, PAC ambra, MIX verde) colorano esclusivamente dati. Raggi in scala 8/4/2, pesi tipografici 400-800, ogni cifra calcolata è in Plex Mono con `tabular-nums`.

La compilazione guidata procede in 16 passi monotematici e si chiude con Escape, X o click sul fondo.

## Licenza

MIT
