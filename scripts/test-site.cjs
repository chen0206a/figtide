/* Static site acceptance: direct file URL, actual Chrome, no backend or API mocks. */
const { chromium } = require('../frontend/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const requests = new Set(), failures = [], consoleErrors = [], viewports = [];
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.add(request.url()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('requestfailed', request => failures.push({ url: request.url(), reason: request.failure()?.errorText }));
    for (const width of [390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(pathToFileURL(path.join(root, 'site/index.html')).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const checks = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
        links: [...document.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), exists: a.hash ? !!document.getElementById(a.hash.slice(1)) : false })),
        buttons: document.querySelectorAll('button').length,
        rawUIColors: [...document.querySelectorAll('[style]')].filter(el => !el.closest('svg') && /#[\da-f]{3,8}\b/i.test(el.getAttribute('style'))).length,
        unresolvedTokens: [...document.querySelectorAll('[style]')].flatMap(el => [...el.getAttribute('style').matchAll(/var\((--lf-[\w-]+)\)/g)].filter(m => !getComputedStyle(el).getPropertyValue(m[1]).trim()).map(m => m[1])),
      }));
      assert.equal(checks.scrollWidth, checks.width, `${width}px page overflows`);
      assert.deepEqual(checks.brokenImages, []); assert.deepEqual(checks.unresolvedTokens, []);
      assert.equal(checks.rawUIColors, 0); assert.equal(checks.buttons, 0, 'Static page must not imply unsupported live actions');
      assert(checks.links.every(link => link.href.startsWith('#') && link.href !== '#' && link.exists), 'All links must reach real sections');
      for (const target of ['features', 'charts', 'assistant', 'start']) {
        await page.locator(`header a[href="#${target}"]`).first().click();
        assert.equal(new URL(page.url()).hash, `#${target}`);
      }
      await page.goto(pathToFileURL(path.join(root, 'site/index.html')).href);
      await page.screenshot({ path: path.join(root, `docs/screenshots/refactor-07-site-${width}.png`), fullPage: true });
      viewports.push({ width, scrollWidth: checks.scrollWidth, imagesLoaded: true, anchorsValid: true, tokensResolved: true });
    }
    assert.deepEqual(consoleErrors, []);
    assert([...requests].every(url => ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(url).hostname)), 'Unexpected external request');
    assert(failures.every(f => /^https:\/\/fonts\./.test(f.url)), 'Unexpected local asset failure');
    const source = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
    assert(!source.includes('var(--accent)'), 'Legacy SVG accent alias must be resolved');
    assert(!source.includes('[你的')); assert(source.includes('[许可证]'));
    assert(!source.includes('在线体验')); assert(source.includes('powershell -ExecutionPolicy Bypass -File .\\scripts\\start.ps1'));
    const evidence = { checkedAt: new Date().toISOString(), source: 'direct file URL', viewports, externalRequests: [...requests], requestFailures: failures, pageErrors: consoleErrors, paidRequests: 0 };
    fs.writeFileSync(path.join(root, 'docs/test-evidence/refactor07-site.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`PASS: ${viewports.length}/4 viewports; all anchors, images, tokens and network destinations checked.`);
    console.log(`Font request failures: ${failures.length}.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
