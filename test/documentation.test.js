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

test('rende progressivo e compatto il dettaglio annuale', () => {
  const explorerStart = html.indexOf('class="workspace-section annual-explorer-section"');
  const explorerEnd = html.indexOf('<!-- Chart -->', explorerStart);
  const explorer = html.slice(explorerStart, explorerEnd);

  assert.ok(explorer.includes('Verifica del risultato'));
  assert.ok(explorer.includes('Percorso di calcolo'));
  assert.ok(explorer.includes('Soglie fiscali dell’anno'));
  assert.ok(explorer.includes('annual-tax-thresholds'));
  assert.equal((explorer.match(/<details class="calc-step"/g) || []).length, 7);
  assert.ok(explorer.includes('<details class="calc-step" open>'));
  assert.ok(explorer.includes('4 · Allocazione'));
  assert.match(styles, /\.calc-flow\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.calc-step-summary\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.fiscal-threshold-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
});

test('separa i nuclei fiscali nell esploratore annuale', () => {
  assert.ok(html.includes('1 · Reddito e previdenza'));
  assert.ok(html.includes('2 · Imposta e agevolazioni'));
  assert.ok(html.includes('annual-supplementary-treatment-value'));
  assert.ok(html.includes('annual-tax-wedge-bonus-value'));
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
