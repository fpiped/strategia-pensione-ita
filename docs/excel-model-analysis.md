# Analisi modello Excel FP vs ETF 2022

File analizzato: `FP vs. ETF 2022_production.xlsm`

Data analisi: 2026-06-25

## Stato lettura

Il file e' un `.xlsm` con macro VBA (`xl/vbaProject.bin`), 6 fogli e molti grafici/formule.

Fogli:

- `Input`
- `Output`
- `Bug-Miglioramenti`
- `Cap eff inv e Reddito netto`
- `Analisi 2021 vs 2022 -caso base`
- `Liste`

Sono stati letti fogli, formule, valori cached, nomi definiti e struttura interna. Le macro non sono state eseguite. Sul sistema non risultano installati `olevba` o LibreOffice, quindi il codice VBA non e' ancora stato estratto in forma leggibile.

## Idea centrale del modello Excel

Il modello Excel non confronta solo "stesso budget annuo messo in FP o ETF".

La logica piu' interessante e':

```text
Calcolo reddito netto senza FP
Calcolo reddito netto con FP
Capitale effettivamente investito = reddito netto senza FP - reddito netto con FP
```

Poi usa quel capitale netto come budget comparabile per l'ETF.

Questo rende il confronto piu' rigoroso quando si vuole misurare il sacrificio reale sullo stipendio netto, non solo il versamento lordo.

## Blocchi principali del foglio Output

| Blocco | Colonne | Scopo |
|---|---:|---|
| Base | B:H | Anno, RAL, premi/straordinari, imponibili |
| ETF no FP | K:BG | Fiscalita' senza FP, reddito netto, investimento ETF, montante ETF, IRR |
| FP saturato | BI:DK | Fiscalita' con FP al limite deducibile, contributo datore, montante FP, IRR |
| FP+ETF | DM:GI | Quota minima/volontaria nel FP piu' ETF con capitale netto residuo |
| Confronto/Solver | GK:GO | Montanti finali e rendimento ETF necessario a pareggiare |

## Formule chiave

Caso base cached del file:

- RAL: 50.000
- limite deducibile 2022: 5.165
- INPS: 9,49%
- FP lordo: 5%
- ETF lordo: 8%
- contributo datore: 1,55%
- adesione minima aderente: 0,55%
- costo annuo FP: 22
- costo annuo ETF: 5
- bollo ETF: 0,2%

### Capitale netto investito

Nel caso FP saturato:

```text
AK = reddito netto senza FP
CL = reddito netto con FP saturato
CY = AK - CL
```

Nel caso base anno 1:

```text
AK4 = 31.869,72
CL4 = 29.507,98
CY4 = 2.361,74
```

Quindi, pur versando 5.165 nel FP, il sacrificio netto sul reddito e' circa 2.361,74 grazie a deduzione e contributo datore.

### ETF comparabile

Nel blocco ETF:

```text
AM = CY
```

Quindi l'ETF investe il capitale netto comparabile, non il versamento lordo FP.

### FP saturato

Nel caso base:

```text
CN = contributo datore
CR = versamento volontario
CW = quota investita nel FP = CN + CR
```

Esempio anno 1:

```text
CN4 = 775
CR4 = 4.390
CW4 = 5.165
```

### FP+ETF

Il blocco FP+ETF usa la stessa idea di parita' di sacrificio netto:

```text
FD = quota effettivamente versata / sacrificio netto FP
FN = CY - FD
```

Dove:

- `FD` e' il costo netto della quota FP scelta.
- `FN` e' la quota residua investibile in ETF mantenendo lo stesso sacrificio netto del caso FP saturato.

Esempio anno 1:

```text
CY4 = 2.361,74
FD4 = 147,95
FN4 = 2.213,79
```

## Funzionalita' Excel vs nostro modello

| Feature | Excel 2022 | Nostro modello | Priorita' |
|---|---|---|---|
| Confronto FP/PAC a parita' di budget lordo | Parziale | Si | Gia' presente |
| Confronto a parita' di sacrificio netto | Si | No | Alta |
| Quota oltre deduzione sempre ETF/PAC | Si | Si | Gia' presente |
| Mix FP+ETF/PAC | Si | Si, ottimizzato anno per anno | Gia' presente |
| Limite deduzione ordinario | 5.165 2022 | 5.164,57 attuale | Gia' presente |
| Maggiorazione prima occupazione post 2006 | Non evidente nella prima lettura | Si | Gia' aggiunta |
| Contributo datore | Si | Si | Gia' presente |
| Contributo datore su imponibile TFR/minimo retributivo | Si | No, usa RAL | Media |
| Adesione minima su imponibile TFR/minimo retributivo | Si | No, usa RAL | Media |
| INPS | Si, con massimale e IVS aggiuntivo | Semplificato | Media |
| IRPEF | 2022 dettagliata | 2025 aggiornata | Gia' presente, piu' attuale |
| Addizionali regionali/comunali a scaglioni | Si | Percentuale manuale | Bassa/media |
| Ulteriori detrazioni manuali | Non come nostro campo sintetico | Si | Gia' presente |
| Bonus ex Renzi / trattamento integrativo | Si | No, gestibile manualmente | Bassa |
| Detrazione aggiuntiva lavoro dipendente | Si | No, gestibile manualmente | Bassa |
| Rendimento FP lordo/netto | Si | Ipotesi gia' netta | Media |
| Tassazione annua rendimenti FP 12,5%-20% | Si | Assorbita nel rendimento FP | Media |
| Costi annui FP | Si | No | Alta |
| Costi annui ETF/PAC | Si | No | Alta |
| Bollo ETF 0,2% | Si | Si | Gia' presente |
| Rendimenti per scaglioni temporali | Si | No | Media |
| Rendimenti casuali | Si | No | Bassa |
| Rendita anticipata/posticipata | Si | No | Bassa |
| Anzianita' pregressa FP | Si | No | Media |
| IRR | Si | No | Media |
| Solver rendimento ETF di pareggio | Si | No | Alta |
| Grafici avanzati | Si | Base | Media |

## Cose da portare nel nostro modello

### 1. Modalita' "parita' di sacrificio netto"

Questa e' la differenza concettuale piu' importante.

Oggi il nostro modello risponde:

```text
Dato un budget annuo lordo, dove conviene allocarlo?
```

L'Excel risponde anche:

```text
A parita' di impatto sul reddito netto, quanto posso investire in PAC rispetto al FP?
```

Implementazione consigliata:

- tenere la modalita' attuale come default semplice;
- aggiungere una modalita' avanzata "confronta a parita' di sacrificio netto";
- in quella modalita', calcolare il reddito netto senza FP e con FP;
- usare la differenza come capitale PAC comparabile.

### 2. Bollo PAC/ETF

L'Excel applica il bollo ETF annuo:

```text
bollo = montante ETF * 0,2%
```

Nel nostro modello e' stato portato come imposta annua fissa dello 0,2% sul montante PAC.

### 3. Costi annui FP/PAC

L'Excel sottrae:

- costo annuo FP;
- costo annuo ETF.

Nel nostro modello oggi i rendimenti sono ipotesi nette ma i costi fissi non sono espliciti. Possiamo aggiungere campi avanzati con default zero.

### 4. Solver rendimento PAC di pareggio

L'Excel espone il rendimento ETF necessario a pareggiare FP o FP+ETF.

Per il nostro tool sarebbe molto utile come output:

```text
Rendimento PAC di pareggio: x%
```

Questo spiega meglio "quanto deve rendere il PAC per vincere".

### 5. Base contributo datore piu' flessibile

L'Excel consente di calcolare datore e adesione minima su:

- RAL;
- imponibile TFR;
- minimo retributivo.

Noi oggi usiamo RAL. Si puo' aggiungere una selezione avanzata, ma non e' urgente quanto bollo/sacrificio netto.

## Cose da non portare subito

- Fiscalita' 2022: e' superata.
- Bonus ex Renzi dettagliato: meglio campo manuale "ulteriori detrazioni" salvo esigenze specifiche.
- Addizionali locali automatiche: alta manutenzione.
- Rendimenti casuali: rischiano di complicare troppo la UI.
- Macro Excel e solver VBA: meglio riscrivere in JS con funzioni pure.

## Proposta priorita'

1. Aggiungere costi annui FP/PAC.
2. Aggiungere output "rendimento PAC di pareggio".
3. Aggiungere modalita' avanzata "parita' di sacrificio netto".
4. Solo dopo valutare base contributiva datore/minimo retributivo.

## Nota sul file Excel

Il file `.xlsm` resta non tracciato da git. Non va committato nel repo salvo decisione esplicita.
