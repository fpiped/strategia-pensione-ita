/**
 * Test end-to-end dell'app in browser headless.
 *
 * Copre la fascia che i test unitari non toccano: controller, binding
 * store<->DOM e view. Avvia un server statico su porta effimera, guida
 * Chromium con Playwright e verifica persistenza, condivisione scenari,
 * ripristino, rendering di tabella/esploratore e assenza di richieste
 * a host esterni.
 *
 * Prerequisiti (solo sviluppo): `npm install` e `npx playwright install chromium`.
 * Esecuzione: `npm run test:e2e`.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml'
};

function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = join(ROOT, safePath === '/' ? 'index.html' : safePath);
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

const failures = [];
function check(label, condition, detail = '') {
  console.log(`${condition ? 'ok' : 'FAIL'} - ${label}${condition || !detail ? '' : ` (${detail})`}`);
  if (!condition) failures.push(label);
}

async function waitBoot(page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-booting'));
}

async function setNumber(page, id, value) {
  await page.evaluate(([id, value]) => {
    const input = document.getElementById(id);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);
}

async function setSelect(page, id, value) {
  await page.evaluate(([id, value]) => {
    const select = document.getElementById(id);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);
}

const fieldValue = (page, id) => page.evaluate((id) => document.getElementById(id).value, id);
const storedScenario = (page) => page.evaluate(() => localStorage.getItem('strategia-pensione-scenario-v3'));

const { server, base: BASE } = await startStaticServer();
// channel 'chromium' usa il build completo installato da `playwright install
// chromium`, senza richiedere la headless shell separata.
const browser = await chromium.launch({ channel: 'chromium' });

try {
  // --- 1. Primo accesso, modifica input, salvataggio in localStorage ---
  const ctxA = await browser.newContext();
  await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const pageA = await ctxA.newPage();
  const pageErrors = [];
  pageA.on('pageerror', (err) => pageErrors.push(String(err)));
  await pageA.goto(BASE);
  await waitBoot(pageA);

  check('boot: nessuno scenario salvato al primo accesso', (await storedScenario(pageA)) === null);

  const pacDefaults = await pageA.evaluate(() => ({
    fpReturn: document.getElementById('rendimentoAnnualeFpPerc')?.value,
    guidedFpReturn: document.getElementById('guided-rendimento-fp')?.value,
    mode: document.getElementById('rendimentoPacMode')?.value,
    percentCost: document.getElementById('costiAnnuiPacPerc')?.value,
    fixedCost: document.getElementById('costiFissiPac')?.value,
    guidedMode: document.getElementById('guided-rendimento-pac-mode')?.value,
    guidedPercentCost: document.getElementById('guided-costi-pac')?.value,
    guidedFixedCost: document.getElementById('guided-costi-fissi-pac')?.value,
    costsVisible: !document.querySelector('[data-return-extra="pac"]')?.hidden
  }));
  check('predefiniti rendimenti: FP netto 3%; PAC lordo con 0,2% e 10 EUR annui',
    pacDefaults.fpReturn === '3'
      && pacDefaults.guidedFpReturn === '3'
      && pacDefaults.mode === 'lordo'
      && pacDefaults.percentCost === '0.2'
      && pacDefaults.fixedCost === '10'
      && pacDefaults.guidedMode === 'lordo'
      && pacDefaults.guidedPercentCost === '0.2'
      && pacDefaults.guidedFixedCost === '10'
      && pacDefaults.costsVisible,
    JSON.stringify(pacDefaults)
  );

  const lossAssumptions = await pageA.evaluate(() => {
    const inspect = (id) => {
      const element = document.getElementById(id);
      return {
        visible: Boolean(element && element.getBoundingClientRect().height > 0),
        text: element?.textContent.replace(/\s+/g, ' ').trim() || ''
      };
    };
    return {
      returns: inspect('return-loss-assumption'),
      explorer: inspect('annual-loss-assumption'),
      inps: inspect('inps-ceiling-assumption'),
      deductions: inspect('high-income-deductions-assumption'),
      fixedCosts: inspect('fixed-cost-optimization-assumption')
    };
  });
  check('rendimenti: limite sulle perdite visibile nel pannello',
    lossAssumptions.returns.visible
      && lossAssumptions.returns.text.includes('rendimenti negativi esclusi')
      && lossAssumptions.returns.text.includes('compensazioni PAC'),
    JSON.stringify(lossAssumptions.returns)
  );
  check('esploratore: limite sulle perdite visibile',
    lossAssumptions.explorer.visible
      && lossAssumptions.explorer.text.includes('non include anni di rendimento negativo')
      && lossAssumptions.explorer.text.includes('riporto fiscale'),
    JSON.stringify(lossAssumptions.explorer)
  );
  check('fiscalità: approssimazione massimale INPS visibile',
    lossAssumptions.inps.visible
      && lossAssumptions.inps.text.includes('massimale contributivo 2026')
      && lossAssumptions.inps.text.includes('specifiche posizioni contributive'),
    JSON.stringify(lossAssumptions.inps)
  );
  check('fiscalità: approssimazione riduzione detrazioni visibile',
    lossAssumptions.deductions.visible
      && lossAssumptions.deductions.text.includes('riduzione di 440 €')
      && lossAssumptions.deductions.text.includes('categorie escluse'),
    JSON.stringify(lossAssumptions.deductions)
  );
  check('ottimizzazione: approssimazione costi fissi pluriennali visibile',
    lossAssumptions.fixedCosts.visible
      && lossAssumptions.fixedCosts.text.includes('orizzonte residuo')
      && lossAssumptions.fixedCosts.text.includes('versamenti futuri')
      && lossAssumptions.fixedCosts.text.includes('ottimo globale'),
    JSON.stringify(lossAssumptions.fixedCosts)
  );

  const deductionDefaults = await pageA.evaluate(() => ({
    ordinary: document.getElementById('detrazioniOrdinarie')?.value,
    treatment: document.getElementById('detrazioniTrattamentoIntegrativo')?.value,
    guidedOrdinary: document.getElementById('guided-detrazioni-ordinarie')?.value,
    guidedTreatment: document.getElementById('guided-detrazioni-trattamento-integrativo')?.value
  }));
  check('detrazioni: due controlli autonomi inizializzati a zero',
    Object.values(deductionDefaults).every((value) => value === '0'),
    JSON.stringify(deductionDefaults)
  );
  await setNumber(pageA, 'detrazioniOrdinarie', 1200);
  await setNumber(pageA, 'detrazioniTrattamentoIntegrativo', 800);
  await pageA.waitForFunction(() =>
    document.getElementById('guided-detrazioni-ordinarie')?.value === '1200'
    && document.getElementById('guided-detrazioni-trattamento-integrativo')?.value === '800'
  );
  check('detrazioni: pannello e guidata condividono entrambi i valori', true);
  await setNumber(pageA, 'detrazioniOrdinarie', 0);
  await setNumber(pageA, 'detrazioniTrattamentoIntegrativo', 0);

  const frequencyControl = await pageA.evaluate(() => {
    const select = document.getElementById('frequenzaInvestimento');
    const buttons = [...document.querySelectorAll('.investment-frequency-buttons button')];
    const selectRect = select.getBoundingClientRect();
    const activeStyle = getComputedStyle(buttons[0]);
    const inactiveStyle = getComputedStyle(buttons[1]);
    const primaryStyle = getComputedStyle(document.getElementById('open-guided-mode'));
    const logoStyle = getComputedStyle(document.querySelector('.logo-mark'));
    return {
      selectWidth: selectRect.width,
      selectHeight: selectRect.height,
      selectDisplay: getComputedStyle(select).display,
      buttonDisplay: getComputedStyle(buttons[0]).display,
      activeBackground: activeStyle.backgroundColor,
      inactiveBackground: inactiveStyle.backgroundColor,
      primaryBackground: primaryStyle.backgroundColor,
      logoBackground: logoStyle.backgroundColor,
      controlRect: document.querySelector('.investment-frequency-control').getBoundingClientRect().toJSON(),
      firstCardRect: document.querySelector('.params-grid > .param-card').getBoundingClientRect().toJSON(),
      secondCardRect: document.querySelectorAll('.params-grid > .param-card')[1].getBoundingClientRect().toJSON(),
      overflows: document.querySelector('.investment-frequency-control').scrollWidth
        > document.querySelector('.investment-frequency-control').clientWidth
    };
  });
  check('hero: select tecnico nascosto', frequencyControl.selectDisplay === 'none' && frequencyControl.selectWidth === 0 && frequencyControl.selectHeight === 0, JSON.stringify(frequencyControl));
  check('hero: pulsanti modalità stilizzati', frequencyControl.buttonDisplay === 'grid' && frequencyControl.activeBackground !== frequencyControl.inactiveBackground, JSON.stringify(frequencyControl));
  check('palette: logo e compilazione guidata usano lo stesso verde di ogni anno',
    frequencyControl.activeBackground === frequencyControl.primaryBackground
      && frequencyControl.activeBackground === frequencyControl.logoBackground,
    JSON.stringify(frequencyControl)
  );
  check('pannello: controllo modalità senza overflow', !frequencyControl.overflows, JSON.stringify(frequencyControl));
  check('pannello: modalità prima delle sottosezioni e su entrambe le colonne',
    frequencyControl.controlRect.bottom < frequencyControl.firstCardRect.top
      && Math.abs(frequencyControl.controlRect.left - frequencyControl.firstCardRect.left) <= 1
      && Math.abs(frequencyControl.controlRect.right - frequencyControl.secondCardRect.right) <= 1,
    JSON.stringify(frequencyControl)
  );

  await setNumber(pageA, 'durata', 1);
  await pageA.waitForFunction(() => document.getElementById('investment-year1-equivalent-copy')?.textContent === 'Tutto nel FP.');
  const technicalResidual = await pageA.evaluate(() => ({
    summary: document.getElementById('investment-year1-equivalent-copy')?.textContent || '',
    allocation: document.querySelector('#output-table tbody tr')?.cells[3]?.textContent || '',
    gross: document.querySelector('#output-table tbody tr')?.cells[2]?.textContent || '',
    fp: document.querySelector('#output-table tbody tr')?.cells[4]?.textContent || '',
    pac: document.querySelector('#output-table tbody tr')?.cells[6]?.textContent || ''
  }));
  check('residuo PAC: presentato come FP sostanziale, non come vero mix',
    technicalResidual.summary === 'Tutto nel FP.'
      && technicalResidual.allocation === 'FP'
      && technicalResidual.fp === technicalResidual.gross
      && technicalResidual.pac === '0 €',
    JSON.stringify(technicalResidual)
  );

  await setNumber(pageA, 'durata', 42);
  await setNumber(pageA, 'investimento', 8000);
  await pageA.waitForFunction(() => localStorage.getItem('strategia-pensione-scenario-v3') !== null);

  const saved = JSON.parse(await storedScenario(pageA));
  check('salvataggio: diff in localStorage', saved?.durata === 42 && saved?.investimento === 8000, JSON.stringify(saved));
  check('salvataggio: solo le chiavi modificate', saved && !('reddito' in saved));

  // --- 2. Rendering: tabella, esploratore e interazione ---
  const table = await pageA.evaluate(() => {
    const rows = [...document.querySelectorAll('#output-table tbody tr')];
    return {
      anni: rows.slice(0, 3).map((r) => r.dataset.anno),
      celle: [...rows[0].cells].map((c) => c.textContent),
      sequenza: document.getElementById('metric-sequence-value').textContent,
      valoreOttimale: document.getElementById('result-best-value').textContent
    };
  });
  check('tabella: righe con anno progressivo', table.anni.join(',') === '1,2,3', table.anni.join(','));
  check('tabella: celle valorizzate', table.celle.length > 3 && table.celle.every((c) => c !== '' && c !== 'undefined'), table.celle.join('|'));
  check('risultati: sequenza scelte presente', table.sequenza.length > 0, table.sequenza);
  check('risultati: valore ottimale monetario', /€/.test(table.valoreOttimale), table.valoreOttimale);
  const strategyComparison = await pageA.evaluate(() => ({
    ids: [...document.querySelectorAll('#strategy-comparison-grid .strategy-card')]
      .map((card) => card.dataset.strategy),
    text: document.getElementById('strategy-comparison-grid')?.textContent || '',
    criticalPoints: document.querySelectorAll('#allocation-critical-points button').length,
    frontierYear: document.getElementById('allocation-frontier-year')?.textContent || '',
    frontierMax: Number(document.getElementById('allocation-frontier-range')?.max)
  }));
  check('strategie: quattro benchmark renderizzati',
    strategyComparison.ids.join(',') === 'optimized,all-pac,minimum-employer,maximum-fp'
      && strategyComparison.text.includes('Liquidità residua')
      && !/NaN|undefined/.test(strategyComparison.text),
    JSON.stringify(strategyComparison)
  );
  check('strategie: ottimale selezionato in partenza', await pageA.evaluate(() =>
    document.querySelector('[data-strategy="optimized"]')?.getAttribute('aria-checked') === 'true'
  ));
  await pageA.hover('[data-strategy="all-pac"]');
  await pageA.evaluate(() => {
    window.__allPacCardBeforeSelection = document.querySelector('[data-strategy="all-pac"]');
    window.__allPacHoverBackground = getComputedStyle(window.__allPacCardBeforeSelection).backgroundColor;
  });
  await pageA.click('[data-strategy="all-pac"]');
  await pageA.waitForFunction(() =>
    document.querySelector('[data-strategy="all-pac"]')?.getAttribute('aria-checked') === 'true'
    && document.getElementById('annual-explorer-title')?.textContent.includes('Tutto PAC')
  );
  const allPacDetail = await pageA.evaluate(() => {
    const table = document.getElementById('output-table');
    const headers = [...table.tHead.rows[0].cells].map((cell) => cell.textContent);
    const values = [...table.tBodies[0].rows[0].cells].map((cell) => cell.textContent);
    return {
      fp: values[headers.indexOf('Quota FP')],
      pac: values[headers.indexOf('Quota PAC')],
      title: document.getElementById('toggle-results')?.textContent || '',
      explorerTitle: document.getElementById('annual-explorer-title')?.textContent || ''
    };
  });
  check('strategie: tutto PAC alimenta tabella ed esploratore',
    allPacDetail.fp === '0 €'
      && allPacDetail.pac === '8.000 €'
      && allPacDetail.title.includes('Tutto PAC')
      && allPacDetail.explorerTitle.includes('Tutto PAC'),
    JSON.stringify(allPacDetail)
  );
  const stableStrategySelection = await pageA.evaluate(() => {
    const card = document.querySelector('[data-strategy="all-pac"]');
    const style = getComputedStyle(card);
    return {
      sameNode: window.__allPacCardBeforeSelection === card,
      sameBackgroundAsHover: window.__allPacHoverBackground === style.backgroundColor,
      boxShadow: style.boxShadow,
      transitionDuration: style.transitionDuration
    };
  });
  check('strategie: selezione stabile senza ricostruzione o bordino superiore',
    stableStrategySelection.sameNode
      && stableStrategySelection.sameBackgroundAsHover
      && stableStrategySelection.boxShadow === 'none'
      && stableStrategySelection.transitionDuration === '0s',
    JSON.stringify(stableStrategySelection)
  );
  await pageA.click('[data-strategy="maximum-fp"]');
  await pageA.waitForFunction(() =>
    document.querySelector('[data-strategy="maximum-fp"]')?.getAttribute('aria-checked') === 'true'
  );
  check('strategie: massimo FP alimenta il dettaglio senza PAC', await pageA.evaluate(() => {
    const table = document.getElementById('output-table');
    const headers = [...table.tHead.rows[0].cells].map((cell) => cell.textContent);
    const values = [...table.tBodies[0].rows[0].cells].map((cell) => cell.textContent);
    return values[headers.indexOf('Quota PAC')] === '0 €'
      && document.getElementById('annual-explorer-title')?.textContent.includes('Massimo FP');
  }));
  await pageA.click('[data-strategy="optimized"]');
  await pageA.waitForFunction(() =>
    document.querySelector('[data-strategy="optimized"]')?.getAttribute('aria-checked') === 'true'
  );
  check('frontiera: punti critici e intervallo FP disponibili',
    strategyComparison.criticalPoints === 4
      && strategyComparison.frontierYear === 'Anno 1'
      && strategyComparison.frontierMax > 0,
    JSON.stringify(strategyComparison)
  );
  await pageA.click('[data-point="all-pac"]');
  await pageA.waitForFunction(() => document.getElementById('allocation-frontier-range')?.value === '0');
  check('frontiera: tutto PAC selezionabile', await pageA.evaluate(() =>
    document.getElementById('allocation-frontier-metrics')?.textContent.includes('PAC derivato')
    && document.getElementById('allocation-frontier-status')?.textContent.includes('Quota sostenibile')
  ));
  await pageA.click('#allocation-frontier-plus');
  await pageA.waitForFunction(() => document.getElementById('allocation-frontier-range')?.value === '1');
  await pageA.click('#allocation-frontier-minus');
  await pageA.waitForFunction(() => document.getElementById('allocation-frontier-range')?.value === '0');
  check('frontiera: pulsanti più e meno avanzano di 1 euro', true);

  await pageA.click('[data-select-target="frequenzaInvestimento"][data-select-value="singolo"]');
  await pageA.waitForFunction(() => document.querySelector('#output-table tbody tr:nth-child(2)')?.cells[1]?.textContent === '0 €');
  const singlePayment = await pageA.evaluate(() => ({
    description: document.getElementById('investment-frequency-description')?.textContent || '',
    secondYear: [...document.querySelector('#output-table tbody tr:nth-child(2)').cells].map((cell) => cell.textContent),
    label: document.getElementById('investment-amount-label')?.textContent || '',
    variationControlsHidden: [...document.querySelectorAll('select[data-variation-fields]')]
      .every((select) => select.closest('.form-group')?.hidden),
    variationFieldsHidden: [...document.querySelectorAll('select[data-variation-fields]')]
      .every((select) => document.getElementById(select.dataset.variationFields)?.hidden)
  }));
  check('solo anno 1: nessun nuovo investimento dal secondo anno', singlePayment.secondYear[1] === '0 €', singlePayment.secondYear.join('|'));
  check('solo anno 1: allocazione compatta in tabella', singlePayment.secondYear.includes('N/A'), singlePayment.secondYear.join('|'));
  check('solo anno 1: spiegazione coerente senza rinominare il campo',
    singlePayment.description.includes('soltanto il versamento')
      && singlePayment.label === 'Budget annuo a tuo carico');
  check('solo anno 1: controlli andamento nascosti', singlePayment.variationControlsHidden && singlePayment.variationFieldsHidden, JSON.stringify(singlePayment));
  await pageA.click('[data-select-target="frequenzaInvestimento"][data-select-value="annuale"]');
  await pageA.waitForFunction(() => document.querySelector('#output-table tbody tr:nth-child(2)')?.cells[1]?.textContent === '8.000 €');
  check('ogni anno: controlli andamento ripristinati', await pageA.evaluate(() =>
    [...document.querySelectorAll('select[data-variation-fields]')]
      .every((select) => !select.closest('.form-group')?.hidden)
  ));

  await pageA.evaluate(() => document.querySelector('#output-table tbody tr:nth-child(5)').click());
  await pageA.waitForTimeout(200);
  check('esploratore: click su riga seleziona anno', (await fieldValue(pageA, 'annual-explorer-year')) === '5');
  check('esploratore: confronto fiscale prima/dopo', await pageA.evaluate(() =>
    document.getElementById('annual-fiscal-cost-before-after-value')?.textContent.includes('→')
  ));
  check('esploratore: exit riconciliata', await pageA.evaluate(() => {
    const formula = document.getElementById('annual-exit-formula')?.textContent || '';
    return formula.includes(' FP + ') && formula.includes(' = ') && formula.includes(' netto');
  }));
  check('esploratore: nessuna falsa soglia di capienza', await pageA.evaluate(() => {
    const text = document.querySelector('.annual-explorer-section')?.textContent || '';
    return !text.includes('Tetto da capienza') && !text.includes('Deduzione utile') && !/NaN|undefined/.test(text);
  }));
  check('esploratore: dettaglio progressivo senza griglia a vuoti', await pageA.evaluate(() => {
    const steps = [...document.querySelectorAll('.annual-explorer-section details.calc-step')];
    const openSteps = steps.filter((step) => step.open);
    const thresholds = document.querySelector('.annual-explorer-section details.fiscal-thresholds');
    return steps.length === 7
      && openSteps.length === 0
      && thresholds?.open === true;
  }));
  check('esploratore: soglie fiscali contestuali renderizzate', await pageA.evaluate(() => {
    const cards = [...document.querySelectorAll('#annual-tax-thresholds .fiscal-threshold-card')];
    const text = document.querySelector('.fiscal-thresholds')?.textContent || '';
    return cards.length === 7
      && text.includes('Aliquota marginale IRPEF')
      && text.includes('Detrazione da lavoro')
      && text.includes('Cuneo: detrazione IRPEF')
      && text.includes('28.000 €')
      && !/NaN|undefined/.test(text);
  }));

  // --- 3. Reload: lo scenario sopravvive ---
  await pageA.reload();
  await waitBoot(pageA);
  check('reload: durata ripristinata', (await fieldValue(pageA, 'durata')) === '42');
  check('reload: campo guidata allineato', (await fieldValue(pageA, 'guided-durata')) === '42');

  // --- 4. Condivisione: copia link ---
  await pageA.click('#copy-share-link');
  await pageA.waitForTimeout(200);
  const shareLabel = await pageA.evaluate(() => document.querySelector('#copy-share-link [data-share-label]').textContent);
  const shareUrl = await pageA.evaluate(() => navigator.clipboard.readText());
  check('condivisione: feedback sul bottone', shareLabel === 'Copiato!', shareLabel);
  check('condivisione: URL con fragment #s=', shareUrl.startsWith(BASE + '#s='), shareUrl);

  // --- 5. Apertura del link in un contesto pulito ---
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto(shareUrl);
  await waitBoot(pageB);
  check('link: durata dal link condiviso', (await fieldValue(pageB, 'durata')) === '42');
  check('link: URL ripulito dal fragment', (await pageB.evaluate(() => window.location.hash + window.location.search)) === '');
  check('link: scenario adottato in localStorage', JSON.parse(await storedScenario(pageB))?.durata === 42);
  const optimalValue = await pageB.evaluate(() => document.getElementById('result-best-value').textContent);
  check('link: risultati calcolati', /€/.test(optimalValue) && optimalValue.trim() !== '0 €', optimalValue);

  // --- 6. Link corrotto: fallback silenzioso ai predefiniti ---
  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  const corruptErrors = [];
  pageC.on('pageerror', (err) => corruptErrors.push(String(err)));
  await pageC.goto(BASE + '#s=payload-corrotto-!!!');
  await waitBoot(pageC);
  check('link corrotto: app funzionante con predefiniti', (await fieldValue(pageC, 'durata')) === '30');
  check('link corrotto: nessun errore JS', corruptErrors.length === 0, corruptErrors.join(' | '));

  await setNumber(pageC, 'durata', 1);
  await setNumber(pageC, 'reddito', 6000);
  await setNumber(pageC, 'altriRedditi', 6000);
  await setNumber(pageC, 'investimento', 0);
  await setNumber(pageC, 'contributiInpsPerc', 0);
  await pageC.waitForFunction(() =>
    document.getElementById('annual-work-irpef-value')?.textContent.includes('1.380')
    && document.getElementById('annual-irpef-value')?.textContent.includes('2.760')
  );
  const supplementaryBases = await pageC.evaluate(() => ({
    workTax: document.getElementById('annual-work-irpef-value')?.textContent || '',
    totalTax: document.getElementById('annual-irpef-value')?.textContent || '',
    treatment: document.getElementById('annual-supplementary-treatment-value')?.textContent || ''
  }));
  check('trattamento integrativo: altri redditi non creano capienza da lavoro',
    supplementaryBases.workTax.includes('1.380')
      && supplementaryBases.totalTax.includes('2.760')
      && supplementaryBases.treatment.includes('0 €'),
    JSON.stringify(supplementaryBases)
  );

  // --- 7. Ripristino predefiniti ---
  pageB.on('dialog', (dialog) => dialog.accept());
  await pageB.click('#reset-scenario');
  await pageB.waitForTimeout(600);
  check('reset: durata ai predefiniti', (await fieldValue(pageB, 'durata')) === '30');
  check('reset: localStorage svuotato', (await storedScenario(pageB)) === null);

  // --- 8. Scenario predefinito: il link resta pulito ---
  await ctxB.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await pageB.click('#copy-share-link');
  await pageB.waitForTimeout(200);
  check('predefiniti: link senza fragment', (await pageB.evaluate(() => navigator.clipboard.readText())) === BASE);

  // --- 9. Link condiviso con tab salvato (la navigazione non deve mangiarlo) ---
  const ctxD = await browser.newContext();
  const pageD = await ctxD.newPage();
  await pageD.goto(BASE);
  await waitBoot(pageD);
  await pageD.evaluate(() => localStorage.setItem('strategia-pensione-active-tab', 'informazioni'));
  await pageD.goto('about:blank');
  await pageD.goto(shareUrl);
  await waitBoot(pageD);
  check('tab salvato: scenario dal link applicato', (await fieldValue(pageD, 'durata')) === '42');
  check('tab salvato: fragment ripulito', (await pageD.evaluate(() => window.location.hash)) === '');

  // --- 10. Nessuna richiesta a host esterni (asset vendorizzati) ---
  const ctxE = await browser.newContext();
  const pageE = await ctxE.newPage();
  const externalHosts = new Set();
  pageE.on('request', (req) => {
    const { hostname } = new URL(req.url());
    if (hostname !== '127.0.0.1' && hostname !== 'localhost') externalHosts.add(hostname);
  });
  await pageE.goto(BASE);
  await waitBoot(pageE);
  await pageE.waitForTimeout(1200);
  const unexpected = [...externalHosts];
  check('privacy: nessuna richiesta a host esterni', unexpected.length === 0, unexpected.join(', '));
  check('vendor: font Inter caricato in locale', await pageE.evaluate(() => document.fonts.check('16px Inter')));
  check('vendor: Chart.js e icone presenti', await pageE.evaluate(() => Boolean(window.Chart && document.querySelector('span[data-lucide] svg'))));
  check('fonti: regole fiscali 2026 renderizzate', await pageE.evaluate(() =>
    document.querySelector('[data-fiscal-year]')?.textContent === '2026' &&
    document.querySelectorAll('#fiscal-source-list .docs-source-item').length >= 14
  ));
  const fiscalSourceDetails = await pageE.evaluate(() => {
    const deduction = document.querySelector('[data-fiscal-rule="pensionDeduction"]');
    return {
      text: deduction?.textContent.replace(/\s/g, ' ') ?? '',
      links: deduction?.querySelectorAll('a[href]').length ?? 0
    };
  });
  check('fonti: valore deduzione presente', fiscalSourceDetails.text.includes('5.300 €'), fiscalSourceDetails.text);
  check('fonti: riferimenti deduzione presenti', fiscalSourceDetails.links === 2, String(fiscalSourceDetails.links));
  check('metodologia: decisioni di calcolo versionate e renderizzate', await pageE.evaluate(() => {
    const container = document.getElementById('calculation-methodology-list');
    const text = container?.textContent || '';
    return Boolean(container?.dataset.methodologyVersion)
      && container.querySelectorAll('[data-calculation-method]').length >= 18
      && text.includes('Decisione')
      && text.includes('Assunzioni / approssimazioni');
  }));

  // --- 11. Specularità dei temi: un solo set di binding, due palette.
  // Per ogni coppia di entità e proprietà deve valere:
  // (uguali in light) <=> (uguali in dark). Se un override tema-specifico
  // binda un token diverso dal light, questo controllo fallisce.
  {
    const entities = [
      ['pagina', 'body'],
      ['header', 'header'],
      ['card-workspace', '.workspace-section'],
      ['param-card', '.param-card'],
      ['input', '.control-shell .control-field'],
      ['unita', '.control-shell .unit'],
      ['chip-output', '.control-shell .mini-metric.output'],
      ['verdetto', '.result-decision-panel'],
      ['metric-card', '.metric-card'],
      ['th', '#output-table th'],
      ['td', '#output-table td'],
      ['riga-attiva-td', '#output-table tr.active td'],
      ['card-spiegazione', '.result-explanation-card'],
      ['bottone-primario', '.btn-primary'],
      ['bottone-secondario', '.btn-secondary'],
      ['segmented-attivo', '.segmented-control button.active'],
      ['docs-index', '.docs-index'],
      ['intro', '.intro-section'],
      ['footer', 'footer'],
      ['guidata-dialog', '.guided-dialog'],
      ['guidata-header', '.guided-dialog .guided-header'],
      ['guidata-step', '.guided-dialog .guided-step.active'],
      ['guidata-body', '.guided-dialog .guided-body.control-shell'],
      ['guidata-help', '.guided-dialog .guided-note .help-entry'],
      ['guidata-chip', '.guided-dialog .mini-metric.output'],
      ['guidata-input', '.guided-dialog .control-field'],
      ['theme-toggle', '.theme-toggle'],
      ['nota-guida-help', '.guided-dialog .guided-note .help-entry'],
    ];
    const props = ['backgroundColor', 'color', 'borderTopColor'];
    // La guidata va aperta: le sue entità sono parte del contratto.
    await pageE.click('#open-guided-mode');
    await pageE.waitForTimeout(300);
    const snapshot = {};
    for (const theme of ['light', 'dark']) {
      // Stesso meccanismo del toggle dell'app: data-theme-switching
      // sospende le transizioni, così lo snapshot non fotografa colori
      // a metà interpolazione.
      await pageE.evaluate((t) => {
        document.documentElement.setAttribute('data-theme-switching', '');
        document.documentElement.setAttribute('data-theme', t);
        // Niente stati di focus negli snapshot: il confronto riguarda i
        // binding a riposo, non gli stati transitori.
        document.activeElement?.blur?.();
      }, theme);
      await pageE.waitForTimeout(150);
      snapshot[theme] = await pageE.evaluate(({ entities, props }) => {
        const out = {};
        for (const [name, sel] of entities) {
          const el = document.querySelector(sel);
          if (!el) { out[name] = null; continue; }
          const s = getComputedStyle(el);
          out[name] = Object.fromEntries(props.map((p) => {
            // Bordi a larghezza zero: il colore è rumore (currentColor),
            // non un binding — si confronta solo ciò che si vede.
            if (p === 'borderTopColor' && s.borderTopWidth === '0px') return [p, 'nessun-bordo'];
            return [p, s[p]];
          }));
        }
        return out;
      }, { entities, props });
    }
    const names = entities.map((e) => e[0]).filter((n) => snapshot.light[n] && snapshot.dark[n]);
    const brokenPairs = [];
    for (const prop of props) {
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const [a, b] = [names[i], names[j]];
          const eqLight = snapshot.light[a][prop] === snapshot.light[b][prop];
          const eqDark = snapshot.dark[a][prop] === snapshot.dark[b][prop];
          if (eqLight !== eqDark) brokenPairs.push(`${prop}: ${a}/${b}`);
        }
      }
    }
    check('temi: specularità light/dark (stessi binding)', brokenPairs.length === 0, brokenPairs.slice(0, 5).join(' · '));
    await pageE.keyboard.press('Escape');
  }

  check('nessun errore JS nella sessione principale', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} controlli falliti`);
  process.exit(1);
}
console.log('\nTutti i controlli E2E superati');
