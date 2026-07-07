# Ottimizzazione del plafond prima occupazione — design

Documento di progettazione per l'ottimizzazione dell'uso del **plafond extra
residuo** (maggiorazione deducibile per prima occupazione post 2006). Descrive
il problema, la soluzione proposta (allocazione *forward-looking* via
programmazione dinamica) e i trade-off valutati. Non è ancora implementato.

## Contesto

Chi ha la prima occupazione dopo il 31/12/2006 può recuperare, dal 6° al 25°
anno di partecipazione, la deduzione non usata nei primi 5 anni: fino a
**2.650 €/anno** oltre il limite ordinario di **5.300 €**, entro un plafond
complessivo massimo di **26.500 €** (`FINANCIAL_CONSTANTS`).

Meccanica già presente nel modello (`js/calculators/pension-contributions.js`,
`consumeFirstEmploymentAllowance`):

- **Anni 1–5 (quinquennio, `waitYears > 0`):** il plafond non è spendibile; la
  parte di limite ordinario **non usata** (`5300 − dedotto`) si **accumula** nel
  plafond, fino al tetto di 26.500 €.
- **Anni 6–25 (finestra di recupero):** il limite deducibile sale a
  `5300 + min(2650, plafond residuo)`; dedurre oltre 5.300 **consuma** plafond.

## Il problema

Ci sono **due decisioni distinte**, spesso confuse in una:

1. **Spendere** un plafond dato — in quali anni 6–25 usarlo.
2. **Costruire** il plafond — quanto *sotto*-dedurre negli anni 1–5 (mettere in
   PAC invece che in FP deducibile) per accumularne di più.

Il trade-off che rende il problema interessante: rinunciare a dedurre 1 € presto
(marginale bassa a inizio carriera, ma più anni di capitalizzazione del
risparmio) per dedurre 1 € dopo (marginale alta con reddito cresciuto, ma
capitalizzato meno). Con **reddito che cresce ripido** conviene sotto-dedurre
nel quinquennio; con reddito piatto conviene dedurre subito.

### Perché il motore attuale non lo cattura

L'ottimizzatore corrente (`_optimizeRecommendedAllocation` in
`js/models/FinancialModel.js`) è **miope**: massimizza il netto dell'anno
corrente. Negli anni 1–5, se dedurre in FP batte già il PAC (spesso sì, per il
risparmio fiscale), deduce → consuma il limite ordinario → **accumula meno
plafond**. Fa cioè l'opposto del "quinquennio leggero", perché il beneficio è
futuro e lui guarda solo il presente.

## Due forze in gioco

Il valore di dedurre 1 € nell'anno `t` dipende da:

- **aliquota marginale** al reddito dell'anno `t` — di solito cresce nel tempo
  → spinge a dedurre **più tardi**;
- **capitalizzazione** del risparmio fiscale reinvestito (`reinvestiRisparmio`)
  da `t` all'uscita — più lunga se dedotto **prima**;
- **differenziale FP-vs-PAC** sul capitale spostato.

Il risparmio fiscale esatto è già calcolabile con `calculateTaxSavings`
(`js/calculators/tax-calculator.js`), che include scaglioni IRPEF, addizionali,
trattamento integrativo e bonus cuneo. Nessuna logica fiscale da riscrivere.

## Soluzioni valutate

### A. Greedy di sola spesa (scartata come soluzione completa)

Ottimizzare solo *dove spendere* un plafond dato è un problema di allocazione di
risorsa **separabile e concavo** → greedy sul valore marginale, provabilmente
ottimo, costo trascurabile. **Ma risolve solo metà del problema:** sta sopra la
base miope, che il plafond lo sotto-costruisce. Non risponde alla domanda vera
(se convenga sotto-dedurre nel quinquennio).

### B. Allocazione forward-looking via DP (proposta)

Massimizza il netto **dell'intero orizzonte**, non del singolo anno. Lo stato che
riassume il passato rilevante è **una sola grandezza: il saldo del plafond `P`**.
Data la coppia `(anno t, plafond P)`, il futuro è indipendente da come ci si è
arrivati → sottostruttura ottima → **programmazione dinamica**.

#### Formulazione

- **Stato:** `(t, P)` — anno e saldo plafond.
- **Decisione:** `dₜ` = quota dedotta in FP nell'anno, nel range ammesso:
  - anni 1–5: `dₜ ∈ [0, min(5300, budget)]`
  - anni 6–25: `dₜ ∈ [0, 5300 + min(2650, P)]`
- **Ricorsione:**

  ```
  V(t, P) = max su dₜ di [ valoreImmediato(t, dₜ) + V(t+1, P') ]
  ```

  - `valoreImmediato(t, dₜ)` = netto-a-scadenza dei soldi dell'anno con quota
    dedotta `dₜ`, calcolato con le funzioni esistenti (`_projectFpContribution`,
    `calculateTaxSavings`, `_projectPacContribution`).
  - transizione del plafond:
    - anni 1–5: `P' = min(26500, P + (5300 − dₜ))`
    - anni 6–25: `P' = P − max(dₜ − 5300, 0)`
  - terminale: `V(durata+1, ·) = 0`.

Il "quinquennio leggero" **emerge dalla DP**, non è cablato: negli anni 1–5 la
DP sceglie di sotto-dedurre esattamente quando lo slot futuro migliore batte il
valore di dedurre adesso.

## Complessità computazionale

Costo `= anni × livelli-di-plafond × decisioni-per-stato`. Polinomiale e
limitato: **niente esponenziale, niente N×M annidato.**

Sottigliezza chiave: nella DP il plafond è una **dimensione di stato**, quindi
la sua granularità *moltiplica* il costo (a differenza del greedy di spesa, dove
l'euro-su-euro era gratis perché non c'era stato). L'euro-su-euro sul plafond
esplode; va discretizzato.

| Granularità plafond | Livelli | Decisioni/stato | Transizioni (×25 anni) | Verdetto |
|---|---|---|---|---|
| euro (1 €) | 26.501 | ~5.300 | ~3,5 miliardi | infattibile live |
| 10 € | 2.651 | ~530 | ~35 milioni | pesante |
| **50 €** | 531 | ~106 | ~1,4 milioni | comodo, pochi ms |
| **100 €** | 266 | ~53 | ~350k | banale |

**Ancoraggio:** il modello oggi fa già ~160k valutazioni per ricalcolo
(scan interi × durata) e gira liscio. La DP a 100 € (~350k) è ~2× un ricalcolo
attuale; a 50 € (~1,4M) è ~9× — decine di ms, **dentro il debounce da 200 ms**.

Il plafond come **stato** va quindi discretizzato a 50–100 €; il **valore** per
anno resta esatto. L'errore di discretizzazione tocca solo il *candidato*,
perché il numero mostrato è comunque un **run reale del modello** sullo schedule
scelto.

**Ottimizzazione di riserva:** se `V(t+1, ·)` è concava in `P` (probabile:
rendimenti decrescenti del plafond), il problema interno è concavo → ricerca
ternaria su `dₜ`, ~7 valutazioni invece di ~50 per stato (~10× più veloce). Da
tenere di riserva; di default scan pieno, per sicurezza contro i gradini del
bonus cuneo.

## Approssimazioni e come sono gestite

1. **Feedback del reinvestimento.** `reinvestiRisparmio` fa dipendere il budget
   dell'anno `t+1` dal risparmio dell'anno `t`: sarebbe una terza dimensione di
   stato (esplosione). Non si aggiunge: la DP gira sulla traiettoria di budget
   base (2D, `t × P`), produce lo schedule, e lo schedule viene **validato nel
   modello vero** che include il reinvestimento. Effetto di secondo ordine (poche
   centinaia di €/anno) → schedule near-optimal, numero riportato esatto per
   quello schedule.

2. **Gradini del bonus cuneo** (soglie 20k/32k/40k) e trattamento integrativo:
   rompono la concavità perfetta della funzione-valore annuale. Gestiti valutando
   `valoreImmediato` ai livelli discreti con `calculateTaxSavings` (i gradini
   sono già dentro), non con derivate.

3. **Discretizzazione del plafond** (50–100 €): resa innocua dalla validazione
   finale su modello reale.

**Rete di sicurezza:** oltre allo schedule della DP, si calcolano anche gli
schedule fissi *Subito* (riempi dal primo anno utile) e *Tardi* (dagli ultimi
all'indietro), si eseguono tutti nel modello reale, e si mostra il **migliore**.
Garantisce che il numero mostrato non sia mai peggiore delle alternative ovvie,
anche se la DP near-optimal fosse battuta in un caso patologico.

## Riepilogo dei trade-off

| | Metodo | Costo | Cattura il quinquennio leggero? | Ottimalità |
|---|---|---|---|---|
| Oggi | scan miope per-anno | ~160k/ricalcolo | ❌ | nessuna sul plafond |
| Greedy di spesa | separabile concavo | trascurabile | ❌ (solo spesa) | ottimo del sotto-problema |
| **Forward-looking** | **DP `(anno × plafond)`** | **~0,3–1,4M, dentro il debounce** | ✅ | near-optimal, validata |

Il prezzo reale della soluzione B non è il tempo di calcolo (dentro il debounce)
ma la **discretizzazione del plafond** (mitigata dalla validazione) e il codice
in più da scrivere con cura.

## UI

Nessun toggle a più modalità (a differenza di `modalitaVersamentoFp`): il timing
del plafond è interamente una scelta dell'utente, senza vincoli esterni, quindi
non ha senso far scegliere un piano peggiore. Default = allocazione ottimale,
numero unico. *Subito* e *Tardi* si mostrano come **delta di riferimento** nella
card del plafond (sola lettura) — rendono leggibile quanto vale il timing e
fungono da garanzia di correttezza.

## Passi implementativi

1. `computeDeductionSchedule(trajectory, plafondConfig) → dₜ[]` come **funzione
   pura testabile** in isolamento. Test: reddito piatto → deduci pieno da subito;
   reddito molto crescente → sotto-deduci nel quinquennio e concentra dopo.
2. Rendere configurabile il tetto per-anno del plafond in
   `getAvailableDeductionLimit` / `consumeFirstEmploymentAllowance` (oggi `2650`
   cablato), così lo schedule si inietta come input.
3. Innesto nel modello + validazione contro *Subito*/*Tardi*/base.
4. Card di confronto con i delta.

**Regola ferma:** lo schedule si decide **prima** del loop annuale, mai dentro
(evita l'annidamento N×M).
