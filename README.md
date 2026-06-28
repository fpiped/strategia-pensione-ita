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
- Ottimizza o forza la ripartizione dei versamenti FP tra busta paga e bonifico, stimando effetti su detrazioni lavoro dipendente, ex Bonus Renzi e bonus cuneo fiscale
- Permette rendimenti FP/PAC netti oppure lordi con costi annui e tassazione separata

## Opzioni

La UI ha una sola plancia completa, organizzata per card tematiche: scenario e budget, fondo pensione e contratto, rendimento fondo pensione, rendimento PAC e fiscalità. Non esiste una modalità avanzata globale: i dettagli più tecnici vivono nel riquadro a cui appartengono. La compilazione guidata ripropone le stesse aree una alla volta con spiegazioni, esempi e indicazioni su dove recuperare i dati.

| Opzione | Descrizione |
|---------|-------------|
| Riscatto anticipato | Tassazione 23% invece di 15%→9% |
| Anzianità pregressa FP | Anni già maturati nel fondo pensione per anticipare la riduzione della tassazione in uscita |
| Prima occupazione post 2006 | Aggiunge al limite ordinario il recupero extra, max 2.582,29 €/anno entro plafond residuo |
| Modalità confronto | Budget lordo annuo oppure sacrificio netto equivalente |
| Variazioni periodiche | Aumenti o riduzioni di RAL ordinaria, budget annuo e minimo retributivo annuo in percentuale o euro |
| Premi/bonus imponibili | Aumentano reddito fiscale/previdenziale ma non l'importo su cui si calcolano quota minima aderente e contributo datore |
| Basi contributi FP | Quota minima aderente e contributo datore possono essere calcolati su RAL oppure sullo stesso minimo retributivo annuo |
| Addizionali locali | Modalità manuale oppure calcolo da Regione e Comune; il Comune è cercabile e forza la Regione dalla provincia |
| Contributo datore | Percentuale sulla base datore; viene riconosciuto solo se raggiungi la quota minima aderente |
| Parametri INPS | Aliquota lavoratore selezionabile; massimale contributivo e IVS aggiuntivo sono assunzioni normative automatiche |
| Versamento FP | Ottimizzato dal simulatore, quota minima in busta + extra via bonifico, tutto busta o tutto bonifico |
| Bonus fiscali lavoro dipendente | Ex Bonus Renzi e bonus cuneo fiscale 2025/2026 calcolati automaticamente |
| Rendimenti FP/PAC | Netto già stimato oppure lordo con costi annui, quota agevolata 12,5% e aliquota effettiva calcolata |
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
