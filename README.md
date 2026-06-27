# Calcolatore Fondo Pensione vs PAC

https://pippo995.github.io/calcolatore-fondo-pensione-vs-pac/

Confronta **Fondo Pensione** e **PAC in ETF** nel contesto fiscale italiano.

Assunzione principale: il modello è pensato per un **lavoratore dipendente** e usa RAL ordinaria, eventuali premi/bonus imponibili, contributi INPS stimati, detrazioni da lavoro dipendente e possibile contributo del datore.

## Cosa fa

- Calcola il valore netto finale di FP, PAC e mix consigliato
- Tiene conto di: deduzione IRPEF, contributo datore, tassazione all'uscita
- Stima addizionali regionali e comunali tramite selettori locali o percentuale manuale
- Ottimizza la quota deducibile tra FP e PAC anno per anno
- Considera la quota oltre deduzione sempre nel PAC
- Supporta la maggiorazione per prima occupazione post 31/12/2006, se inserisci plafond extra residuo e anni residui
- Distingue versamenti FP in busta paga e via bonifico per stimare detrazioni lavoro dipendente, ex Bonus Renzi e bonus cuneo fiscale
- Applica al PAC l'imposta di bollo annua dello 0,2% sul montante

## Opzioni

La UI ha due livelli:

- `Semplice`: mostra i controlli necessari per una simulazione rapida.
- `Avanzata`: espone CCNL, fiscalità, variazioni nel tempo e parametri tecnici.

| Opzione | Descrizione |
|---------|-------------|
| Modalità controlli | Semplice oppure avanzata |
| Riscatto anticipato | Tassazione 23% invece di 15%→9% |
| Anzianità pregressa FP | Anni già maturati nel fondo pensione per anticipare la riduzione della tassazione in uscita |
| Prima occupazione post 2006 | Aggiunge al limite ordinario il recupero extra, max 2.582,29 €/anno entro plafond residuo |
| Modalità confronto | Budget lordo annuo oppure sacrificio netto equivalente |
| Variazioni periodiche | Aumenti o riduzioni di reddito e budget annuo in percentuale o euro |
| Premi/bonus imponibili | Aumentano reddito fiscale/previdenziale ma non la base FP/datore |
| Basi contributi FP | RAL, minimo retributivo annuo o importo manuale; base quota aderente e base datore possono coincidere o essere distinte |
| Addizionali locali | Modalità manuale oppure calcolo da Regione e Comune; il Comune è cercabile e forza la Regione dalla provincia |
| Contributo datore | Percentuale sulla base datore, importo fisso annuo o somma delle due componenti |
| Parametri INPS | Aliquota lavoratore, massimale contributivo e IVS aggiuntivo sopra soglia |
| Versamento FP | Quota minima in busta + extra via bonifico, tutto busta o tutto bonifico |
| Bonus fiscali lavoro dipendente | Ex Bonus Renzi e bonus cuneo fiscale 2025/2026 calcolati automaticamente |
| Viste tabella | Mix, confronto scenari o dettaglio completo |

Il calcolo è sempre cumulativo. I versamenti annui sono trattati come investiti nell'anno di versamento. In modalità `Budget lordo annuo` il risparmio fiscale stimato viene reinvestito l'anno successivo; in modalità `Sacrificio netto equivalente` riduce il costo effettivo del versamento FP e non viene reinvestito una seconda volta.

Le aliquote regionali e comunali sono dati MEF 2026 importati nel dataset locale. Il repo non include una pipeline di scraping: committa il dataset normalizzato usato dall'app, non i PDF/file sorgente.

## Avvio locale

Prerequisiti:

- Node.js installato
- un browser moderno

```bash
git clone https://github.com/pippo995/calcolatore-fondo-pensione-vs-pac.git
cd calcolatore-fondo-pensione-vs-pac
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

e apri lo stesso URL.

> Nota: non aprire direttamente `index.html` come file locale. L'app usa moduli JavaScript ES (`type="module"`), quindi serve un piccolo server statico.

## Test

```bash
npm test
```

I test coprono la logica principale di calcolo del modello finanziario.

## Struttura

```text
index.html                         UI e contenuti della guida
styles.css                         stile e responsive layout
js/app.js                          entrypoint JavaScript
js/controllers/FinancialController.js
js/models/FinancialModel.js        logica di calcolo
js/views/FinancialView.js          rendering tabella, metriche e grafico
js/constants/financial-constants.js
js/constants/local-tax-data.js     aliquote regionali/comunali importabili
js/utils/local-tax-helpers.js      calcolo aliquota media effettiva addizionali
test/FinancialModel.test.js        test del modello
```

## Tech

HTML, CSS, JavaScript vanilla. No framework.

L'app usa CDN esterne per Chart.js, Font Awesome e Google Fonts.
