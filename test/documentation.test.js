import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('la guida segue il percorso concettuale e non replica il catalogo controlli', () => {
  const expectedSections = [
    'Il problema',
    'Il metodo',
    'Il calcolo annuale',
    'Investimento netto e investimento lordo',
    'Come leggere i risultati',
    'Assunzioni, semplificazioni e fonti'
  ];
  expectedSections.forEach((title) => assert.ok(html.includes(title), title));
  assert.ok(!html.includes('Le opzioni del calcolatore'));
});

test('rende espliciti investimento netto, timing e destinazione oltre deduzione', () => {
  assert.ok(html.includes('Budget annuo a tuo carico'));
  assert.ok(html.includes('Investimento lordo = quota FP personale + quota PAC'));
  assert.ok(html.includes('Investimento netto = quota FP personale + quota PAC − beneficio fiscale'));
  assert.ok(html.includes('Investimento lordo = investimento netto + beneficio fiscale'));
  assert.ok(html.includes('capitalizzazione posticipata'));
  assert.ok(html.includes('Extra volontario → PAC o FP non dedotto'));
  assert.ok(html.includes('quota minima necessaria al datore'));
  assert.ok(html.includes('incrementi di 1 €'));
  assert.ok(html.includes('non serve mostrarlo come strategia separata'));
  assert.ok(html.includes('Solo anno 1'));
  assert.ok(html.includes('senza aggiungere altri versamenti'));
});

test('espone confronto strategie, frontiera annuale e registro metodologico', () => {
  assert.ok(html.includes('id="strategy-comparison-grid"'));
  assert.ok(html.includes('Stesso esborso personale'));
  assert.ok(html.includes('id="allocation-frontier-range"'));
  assert.ok(html.includes('id="allocation-frontier-minus"'));
  assert.ok(html.includes('id="allocation-frontier-plus"'));
  assert.ok(html.includes('Punti di allocazione rilevanti'));
  assert.ok(html.includes('id="calculation-methodology-list"'));
  assert.ok(html.includes('Registro delle decisioni di calcolo'));
});

test('spiega ricalcolo annuale, salti fiscali, incapienza e perdite', () => {
  assert.ok(html.includes('simula una sequenza di ricalcoli'));
  assert.ok(html.includes('senza farla dipendere da versamenti futuri'));
  assert.ok(html.includes('non è un ottimo globale'));
  assert.ok(html.includes('Detrazioni e capienza'));
  assert.ok(html.includes('Trattamento integrativo e misure sul cuneo'));
  assert.ok(html.includes('Un salto non lascia il budget senza soluzione'));
  assert.ok(html.includes('scaglioni e le esenzioni ordinarie presenti nel dataset'));
  assert.ok(html.includes('un’unica aliquota piatta, sempre sul nuovo imponibile'));
  assert.ok(html.includes('fino a 20.000 € è una somma esente'));
  assert.ok(html.includes('utilizzabile solo fino all’imposta disponibile'));
  assert.ok(html.includes('Le addizionali vengono determinate dopo questa detrazione'));
  assert.ok(html.includes('capienza prodotta dai soli redditi da lavoro ammessi'));
  assert.ok(html.includes('IRPEF lorda complessiva'));
  assert.ok(html.includes('id="annual-work-irpef-value"'));
  assert.ok(html.includes('Plusvalenza PAC = max(montante PAC − capitale versato PAC, 0)'));
  assert.ok(html.includes('credito fiscale riportabile'));
  assert.ok(html.includes('una sola volta per strumento e per anno attivo'));
});

test('segnala nei calcoli e nella compilazione che i rendimenti negativi sono fuori perimetro', () => {
  assert.ok(html.includes('id="return-loss-assumption"'));
  assert.ok(html.includes('id="annual-loss-assumption"'));
  assert.ok(html.includes('id="guided-fp-loss-assumption"'));
  assert.ok(html.includes('id="guided-pac-loss-assumption"'));
  assert.ok(html.includes('riporto fiscale delle perdite FP'));
  assert.ok(html.includes('minusvalenze o compensazioni PAC'));
  assert.match(styles, /\.model-limit-note\s*\{[^}]*var\(--ds-surface-warning\)/s);
});

test('dichiara le approssimazioni su massimale INPS e riduzione detrazioni', () => {
  assert.ok(html.includes('id="inps-ceiling-assumption"'));
  assert.ok(html.includes('id="high-income-deductions-assumption"'));
  assert.ok(html.includes('id="guided-inps-ceiling-assumption"'));
  assert.ok(html.includes('id="guided-high-income-deductions-assumption"'));
  assert.ok(html.includes('il massimale contributivo 2026 è applicato a tutti gli scenari'));
  assert.ok(html.includes('senza distinguere gli oneri interessati dalla riduzione e le categorie escluse'));
});

test('dichiara i casi fiscali personali non modellati', () => {
  assert.ok(html.includes('premi di risultato e altre somme con imposta sostitutiva sono fuori perimetro'));
  assert.ok(html.includes('lavoratori di prima occupazione successiva al 1° gennaio 2007'));
});

test('dichiara l approssimazione pluriennale dovuta ai costi fissi', () => {
  assert.ok(html.includes('id="fixed-cost-optimization-assumption"'));
  assert.ok(html.includes('Ogni quota annuale è proiettata fino all’orizzonte residuo'));
  assert.ok(html.includes('senza includere i versamenti futuri'));
  assert.ok(html.includes('i versamenti futuri potrebbero ammortizzarli sullo stesso conto'));
  assert.ok(html.includes('rendimenti e costi percentuali restano invece proporzionali'));
});

test('rende progressivo e compatto il dettaglio annuale', () => {
  const explorerStart = html.indexOf('class="workspace-section annual-explorer-section"');
  const explorerEnd = html.indexOf('<!-- Chart -->', explorerStart);
  const explorer = html.slice(explorerStart, explorerEnd);

  assert.ok(explorer.includes('Verifica del risultato'));
  assert.ok(explorer.includes('Percorso di calcolo'));
  assert.ok(explorer.includes('Soglie fiscali dell’anno'));
  assert.ok(explorer.includes('annual-tax-thresholds'));
  assert.equal((explorer.match(/<details class="calc-step"/g) || []).length, 7);
  assert.ok(!explorer.includes('<details class="calc-step" open>'));
  assert.ok(explorer.includes('<details class="fiscal-thresholds" open>'));
  assert.ok(explorer.includes('4 · Allocazione'));
  assert.match(styles, /\.calc-flow\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.calc-step-summary\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.fiscal-threshold-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
});

test('mantiene compatte le azioni e le disclosure su mobile', () => {
  const mobileDensityStart = styles.indexOf('Mobile density: preserve 44px touch targets');
  const mobileDensity = styles.slice(mobileDensityStart);

  assert.ok(mobileDensityStart > 0);
  assert.match(mobileDensity, /\.guided-dialog \.guided-footer\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(mobileDensity, /\.guided-dialog \.guided-footer \.btn\s*\{[^}]*min-height:\s*2\.75rem/s);
  assert.match(mobileDensity, /\.calc-step-summary\s*\{[^}]*min-height:\s*3rem/s);
  assert.match(mobileDensity, /\.fiscal-thresholds-summary\s*\{[^}]*min-height:\s*3rem/s);
  assert.match(mobileDensity, /\.docs-index\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(styles, /@media \(max-width: 768px\)\s*\{[\s\S]*?\.investment-frequency-buttons\s*\{[^}]*flex:\s*0 0 auto/s);
});

test('separa i nuclei fiscali nell esploratore annuale', () => {
  assert.ok(html.includes('1 · Reddito e previdenza'));
  assert.ok(html.includes('2 · Imposta e agevolazioni'));
  assert.ok(html.includes('annual-supplementary-treatment-value'));
  assert.ok(html.includes('annual-tax-wedge-bonus-value'));
  [
    'annual-irpef-detail',
    'annual-work-irpef-detail',
    'annual-addizionali-detail',
    'annual-employee-deduction-detail',
    'annual-net-tax-detail',
    'annual-supplementary-treatment-detail',
    'annual-tax-wedge-detail',
    'annual-bonuses-detail'
  ].forEach((id) => assert.ok(html.includes(`id="${id}"`), id));
  assert.match(styles, /\.step-row \.step-row-calculation\s*\{[^}]*font-family:\s*var\(--font-mono\)/s);
});

test('separa le altre detrazioni per effetto sul trattamento integrativo', () => {
  assert.ok(html.includes('id="detrazioniOrdinarie"'));
  assert.ok(html.includes('id="detrazioniTrattamentoIntegrativo"'));
  assert.ok(html.includes('id="guided-detrazioni-ordinarie"'));
  assert.ok(html.includes('id="guided-detrazioni-trattamento-integrativo"'));
  assert.ok(html.includes('Gli importi non vanno duplicati tra i due campi'));
  assert.ok(!html.includes('id="ulterioriDetrazioni"'));
});

test('usa naming coerente e non tratta il beneficio come disponibile alla exit', () => {
  assert.ok(html.includes('TIR annuo sull’investimento netto'));
  assert.ok(html.includes('Beneficio ÷ quota FP personale'));
  assert.ok(!html.includes('TIR annuo sulla spesa'));
  assert.ok(!html.includes('beneficio fiscale ancora disponibile'));
  assert.ok(!html.includes('ha già ridotto la spesa'));
  assert.ok(!html.includes('budget netto'));
  assert.ok(!html.includes('spese effettive'));
});
