# Calcolatore Fondo Pensione vs PAC

https://pippo995.github.io/calcolatore-fondo-pensione-vs-pac/

Confronta **Fondo Pensione** e **PAC in ETF** nel contesto fiscale italiano.

## Cosa fa

- Calcola il valore netto finale di FP, PAC e strategia mista
- Tiene conto di: deduzione IRPEF, contributo datore, tassazione all'uscita
- Mostra il breakeven (quando il PAC supera il FP)

## Opzioni

| Opzione | Descrizione |
|---------|-------------|
| Cumulativo | Versamento ogni anno vs singolo versamento |
| Reinvesti deduzione | Reinveste il risparmio fiscale nel FP |
| Riscatto anticipato | Tassazione 23% invece di 15%→9% |
| Mostra dettaglio | Tutte le colonne vs solo Exit |

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
test/FinancialModel.test.js        test del modello
```

## Tech

HTML, CSS, JavaScript vanilla. No framework.

L'app usa CDN esterne per Chart.js, Font Awesome e Google Fonts.
