import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

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

test('separa i nuclei fiscali nell esploratore annuale', () => {
  assert.ok(html.includes('1 · Reddito e previdenza'));
  assert.ok(html.includes('2 · Imposta e agevolazioni'));
  assert.ok(html.includes('annual-supplementary-treatment-value'));
  assert.ok(html.includes('annual-tax-wedge-bonus-value'));
});
