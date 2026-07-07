# Strategia Pensione

Web app per confrontare una strategia basata su fondo pensione con un PAC in ETF nel contesto fiscale italiano.

Demo: https://fpiped.github.io/strategia-pensione-ita/

## Progetto

Il repository contiene una single-page app statica in HTML, CSS e JavaScript vanilla. L'app espone un simulatore interattivo con una guida integrata: il README documenta solo il progetto, l'avvio locale e la struttura del codice.

Il modello è pensato per scenari da lavoratore dipendente e stima l'impatto di contributi al fondo pensione, risparmio fiscale, contributo del datore, rendimenti e confronto con PAC.

I risultati sono simulazioni indicative e non costituiscono consulenza finanziaria, fiscale o previdenziale.

## Avvio Locale

Prerequisiti:

- Node.js
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

> Non aprire direttamente `index.html` come file locale: l'app usa moduli ES e va servita da un server statico.

## Test

```bash
npm test
```

I test usano il runner nativo di Node.js e coprono la logica principale di calcolo.

## Struttura

```text
index.html                         markup dell'app e contenuti della guida integrata
styles.css                         stile e layout responsive
js/app.js                          entrypoint
js/store.js                        store centrale: unica fonte di verità degli input
js/bindings.js                     binding dichiarativi input ↔ store (pannello e guidata)
js/controllers/FinancialController.js
js/models/FinancialModel.js        orchestrazione dei calcoli
js/views/FinancialView.js          rendering di metriche, tabella e grafico
js/calculators/                    logica fiscale, contributiva e di crescita
js/constants/                      costanti finanziarie e dataset locali
js/utils/                          helper per input e addizionali locali
test/                              test unitari
```

## Dati e Dipendenze

Il progetto non usa framework frontend. Dipende da CDN esterne per Chart.js, Font Awesome e Google Fonts.

Le aliquote regionali e comunali sono incluse come dataset locale normalizzato; il repository non contiene una pipeline di import o scraping dei dati sorgente.

## Licenza

MIT
