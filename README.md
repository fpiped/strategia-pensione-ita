# Calcolatore Fondo Pensione vs PAC

https://fpiped.github.io/strategia-pensione-ita/

Confronta **Fondo Pensione** e **PAC in ETF** nel contesto fiscale italiano.

Assunzione principale: il modello è pensato per un **lavoratore dipendente** e usa reddito annuo ordinario/RAL, eventuali premi/bonus imponibili, contributi INPS stimati, detrazioni da lavoro dipendente e possibile contributo del datore.

## Cosa fa

- Calcola il valore netto finale di FP, PAC e allocazione ottimale
- Tiene conto di: deduzione IRPEF, contributo datore, tassazione all'uscita
- Stima addizionali regionali e comunali tramite selettori locali o percentuale manuale
- Ottimizza la quota deducibile tra FP e PAC anno per anno
- Considera la quota oltre deduzione sempre nel PAC
- Applica il limite di deduzione a 5.300 €/anno (Legge di Bilancio 2026) e la maggiorazione per prima occupazione post 31/12/2006: recupero fino a 2.650 €/anno dal 6° al 25° anno di partecipazione, con plafond accumulato automaticamente se sei ancora nel quinquennio iniziale
- Ottimizza o forza la ripartizione dei versamenti FP tra busta paga e bonifico, stimando effetti su detrazioni lavoro dipendente, ex Bonus Renzi e bonus cuneo fiscale
- Permette rendimenti FP/PAC netti oppure lordi con costi annui e tassazione separata

## Opzioni

La UI ha una sola plancia completa, organizzata per card tematiche: scenario e reddito, investimento, fondo pensione e contratto, rendimento fondo pensione, rendimento PAC e fiscalità. Non esiste una modalità avanzata globale: i dettagli più tecnici vivono nel riquadro a cui appartengono. La compilazione guidata ripropone gli stessi controlli pochi alla volta, in 12 passi, con spiegazioni “Dove si trova / Come viene usato / Cosa comporta” per ogni voce; i suoi campi sono specchi live del pannello (un solo insieme di parametri, più superfici).

| Opzione | Descrizione |
|---------|-------------|
| Riscatto anticipato | Tassazione 23% invece di 15%→9% |
| Anzianità pregressa FP | Anni già maturati nel fondo pensione per anticipare la riduzione della tassazione in uscita |
| Prima occupazione post 2006 | Aggiunge al limite ordinario il recupero extra, max 2.650 €/anno entro plafond residuo (max 26.500 €) |
| Modalità investimento | Budget annuo pianificato oppure pari esborso netto, con esempio calcolato sul primo anno |
| Variazioni periodiche | Aumenti periodici di reddito, investimento, minimo retributivo, premi e altri redditi IRPEF, in percentuale o euro |
| Premi/bonus imponibili | Aumentano reddito fiscale/previdenziale ma non l'importo su cui si calcolano quota minima aderente e contributo datore |
| Basi contributi FP | Quota minima aderente e contributo datore possono essere calcolati su RAL oppure sullo stesso minimo retributivo annuo |
| Addizionali locali | Modalità manuale oppure calcolo da Regione e Comune; il Comune è cercabile e forza la Regione dalla provincia |
| Contributo datore | Percentuale sulla base datore; viene riconosciuto solo se raggiungi la quota minima aderente |
| Parametri INPS | Aliquota lavoratore modificabile (default 9,19%); massimale contributivo e IVS aggiuntivo sono assunzioni normative automatiche |
| Versamento extra | Automatico (ottimizzato anno per anno), extra via bonifico oppure extra in busta; la quota minima passa sempre in busta |
| Bonus fiscali lavoro dipendente | Ex Bonus Renzi e bonus cuneo fiscale 2025/2026 calcolati automaticamente |
| Rendimenti FP/PAC | Netto già stimato oppure lordo con costi annui, quota agevolata 12,5% e aliquota effettiva calcolata |
| Strategia mostrata | Card e selettore per vedere tabella e calcoli esplorabili su allocazione ottimale, FP deducibile o tutto PAC |

Il calcolo è sempre cumulativo. I versamenti annui sono trattati con capitalizzazione posticipata: entrano nel montante a fine anno e iniziano a rendere dall'anno successivo. In modalità `Budget annuo pianificato` il risparmio fiscale stimato viene reinvestito l'anno successivo; in modalità `Pari esborso netto` riduce il costo effettivo del versamento FP e non viene reinvestito una seconda volta.

Le aliquote regionali e comunali sono dati MEF 2026 importati nel dataset locale. Il repo non include una pipeline di scraping: committa il dataset normalizzato usato dall'app, non i PDF/file sorgente.

## Avvio locale

Prerequisiti:

- Node.js installato
- un browser moderno

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
