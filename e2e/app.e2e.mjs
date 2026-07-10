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
const storedScenario = (page) => page.evaluate(() => localStorage.getItem('strategia-pensione-scenario-v1'));

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

  await setNumber(pageA, 'durata', 42);
  await setNumber(pageA, 'investimento', 8000);
  await setSelect(pageA, 'modalitaConfronto', 'sacrificioNetto');
  await pageA.waitForTimeout(600); // oltre il debounce di persistenza

  const saved = JSON.parse(await storedScenario(pageA));
  check('salvataggio: diff in localStorage', saved?.durata === 42 && saved?.investimento === 8000 && saved?.modalitaConfronto === 'sacrificioNetto', JSON.stringify(saved));
  check('salvataggio: solo le chiavi modificate', saved && !('reddito' in saved));

  // --- 2. Rendering: tabella, esploratore e interazione ---
  const table = await pageA.evaluate(() => {
    const rows = [...document.querySelectorAll('#output-table tbody tr')];
    return {
      anni: rows.slice(0, 3).map((r) => r.dataset.anno),
      celle: [...rows[0].cells].map((c) => c.textContent),
      sequenza: document.getElementById('metric-sequence-value').textContent,
      metricaFp: document.getElementById('metric-fp-value').textContent
    };
  });
  check('tabella: righe con anno progressivo', table.anni.join(',') === '1,2,3', table.anni.join(','));
  check('tabella: celle valorizzate', table.celle.length > 3 && table.celle.every((c) => c !== '' && c !== 'undefined'), table.celle.join('|'));
  check('risultati: sequenza scelte presente', table.sequenza.length > 0, table.sequenza);
  check('risultati: metrica FP monetaria', /€/.test(table.metricaFp), table.metricaFp);

  await pageA.evaluate(() => document.querySelector('#output-table tbody tr:nth-child(5)').click());
  await pageA.waitForTimeout(200);
  check('esploratore: click su riga seleziona anno', (await fieldValue(pageA, 'annual-explorer-year')) === '5');

  // --- 3. Reload: lo scenario sopravvive ---
  await pageA.reload();
  await waitBoot(pageA);
  check('reload: durata ripristinata', (await fieldValue(pageA, 'durata')) === '42');
  check('reload: select ripristinata', (await fieldValue(pageA, 'modalitaConfronto')) === 'sacrificioNetto');
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
  check('link: select dal link condiviso', (await fieldValue(pageB, 'modalitaConfronto')) === 'sacrificioNetto');
  check('link: URL ripulito dal fragment', (await pageB.evaluate(() => window.location.hash + window.location.search)) === '');
  check('link: scenario adottato in localStorage', JSON.parse(await storedScenario(pageB))?.durata === 42);
  const metricFp = await pageB.evaluate(() => document.getElementById('metric-fp-value').textContent);
  check('link: risultati calcolati', /€/.test(metricFp) && metricFp.trim() !== '0 €', metricFp);

  // --- 6. Link corrotto: fallback silenzioso ai predefiniti ---
  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  const corruptErrors = [];
  pageC.on('pageerror', (err) => corruptErrors.push(String(err)));
  await pageC.goto(BASE + '#s=payload-corrotto-!!!');
  await waitBoot(pageC);
  check('link corrotto: app funzionante con predefiniti', (await fieldValue(pageC, 'durata')) === '30');
  check('link corrotto: nessun errore JS', corruptErrors.length === 0, corruptErrors.join(' | '));

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
  const unexpected = [...externalHosts].filter((host) => host !== 'api.counterapi.dev');
  check('vendor: nessuna richiesta a CDN esterne', unexpected.length === 0, unexpected.join(', '));
  check('vendor: font Inter caricato in locale', await pageE.evaluate(() => document.fonts.check('16px Inter')));
  check('vendor: Chart.js e icone presenti', await pageE.evaluate(() => Boolean(window.Chart && document.querySelector('span[data-lucide] svg'))));

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
      ['esploratore-attivo', '.explorer-strategy-select button.active'],
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
