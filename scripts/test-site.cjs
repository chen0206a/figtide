/* Static site acceptance: direct file URL, actual Chrome, no backend or API mocks.
   Task 10-5: site/index.html is now the exported product intro, so the checks are
   the ones that matter for GitHub Pages: no overflow at four widths, no placeholder
   anchors, and no network destinations other than the Google Fonts stylesheet. */
const { chromium } = require('../frontend/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

const README = 'https://github.com/chen0206a/figtide#readme';
const REPO = 'https://github.com/chen0206a/figtide';

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, '.runtime/site-acceptance');
  fs.mkdirSync(output, { recursive: true });
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
      const checks = await page.evaluate(readme => {
        const anchors = [...document.querySelectorAll('a[href]')].map(a => ({
          href: a.getAttribute('href'),
          exists: a.hash ? !!document.getElementById(a.hash.slice(1)) : false,
        }));
        return {
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
          anchors,
          buttons: document.querySelectorAll('button').length,
          readmeLinks: anchors.filter(link => link.href === readme).length,
          hiddenReveals: [...document.querySelectorAll('[data-reveal]')]
            .filter(node => getComputedStyle(node).opacity !== '1').length,
          rawUIColors: [...document.querySelectorAll('[style]')]
            .filter(el => !el.closest('svg') && /#[\da-f]{3,8}\b/i.test(el.getAttribute('style'))).length,
          unresolvedTokens: [...document.querySelectorAll('[style]')]
            .flatMap(el => [...el.getAttribute('style').matchAll(/var\((--lf-[\w-]+)\)/g)]
              .filter(m => !getComputedStyle(el).getPropertyValue(m[1]).trim()).map(m => m[1])),
          headerHeight: Math.round(document.querySelector('header')?.getBoundingClientRect().height || 0),
          navVisible: [...document.querySelectorAll('header nav a')]
            .some(link => getComputedStyle(link).display !== 'none' && link.getBoundingClientRect().width > 0),
        };
      }, README);
      assert.equal(await page.title(), '从实验数据到论文插图 · FigTide');
      assert.equal(await page.locator('header [role="img"][aria-label="FigTide"]').count(), 1);
      assert.equal(await page.locator('header a[aria-label="FigTide"]').getAttribute('href'), '#top');
      assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'), await page.title());
      assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://raw.githubusercontent.com/chen0206a/figtide/main/docs/media/social-preview.png');
      assert.equal(await page.locator('meta[name="twitter:card"]').getAttribute('content'), 'summary_large_image');
      assert.equal(checks.scrollWidth, checks.width, `${width}px page overflows`);
      assert(checks.anchors.every(link => link.href !== '#'), 'Placeholder href="#" must not ship');
      assert.deepEqual(
        checks.anchors.filter(link => link.href.startsWith('#') && !link.exists).map(link => link.href),
        [],
        'Every in-page anchor must resolve to an element id',
      );
      assert.deepEqual(checks.brokenImages, []);
      assert.deepEqual(checks.unresolvedTokens, []);
      assert.equal(checks.rawUIColors, 0);
      assert.equal(checks.buttons, 0, 'Static page must not imply unsupported live actions');
      assert.equal(checks.readmeLinks, 3, 'All three former 开始创作 buttons must link to the README install steps');
      assert.equal(checks.hiddenReveals, 0, 'Reduced motion must show every section immediately');
      assert(
        checks.anchors.every(link => (link.href.startsWith('#') ? link.exists : link.href === README || link.href === REPO)),
        'Links must reach a real section, the README install steps or the repository',
      );
      for (const target of ['trace', 'assistant', 'charts']) {
        if (width <= 640) break;
        await page.locator(`header a[href="#${target}"]`).first().click();
        assert.equal(new URL(page.url()).hash, `#${target}`);
      }
      if (width <= 640) {
        assert.equal(checks.navVisible, false, 'Under 640px the header keeps only the logo and the primary action');
        assert(checks.headerHeight <= 64, `Under 640px the header must stay within 64px, got ${checks.headerHeight}`);
      }
      await page.goto(pathToFileURL(path.join(root, 'site/index.html')).href);
      const screenshot = path.join(output, `release-0.1-site-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      if (process.env.LABFLOW_CAPTURE === '1') {
        fs.mkdirSync(path.join(root, 'docs/screenshots'), { recursive: true });
        fs.copyFileSync(screenshot, path.join(root, `docs/screenshots/release-0.1-site-${width}.png`));
      }
      viewports.push({ width, scrollWidth: checks.scrollWidth, readmeLinks: checks.readmeLinks, anchorsValid: true, headerHeight: checks.headerHeight });
    }
    assert.deepEqual(consoleErrors, []);
    assert(
      [...requests].every(url => ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(url).hostname)),
      'Only the Google Fonts stylesheet may be requested',
    );
    assert(failures.every(f => /^https:\/\/fonts\./.test(f.url)), 'Unexpected local asset failure');
    const evidence = {
      checkedAt: new Date().toISOString(),
      source: 'direct file URL',
      page: 'site/index.html',
      viewports,
      externalRequests: [...requests],
      requestFailures: failures,
      pageErrors: consoleErrors,
      paidRequests: 0,
    };
    const report = path.join(output, 'release-0.1-site.json');
    fs.writeFileSync(report, JSON.stringify(evidence, null, 2) + '\n');
    if (process.env.LABFLOW_CAPTURE === '1') {
      fs.mkdirSync(path.join(root, 'docs/test-evidence'), { recursive: true });
      fs.copyFileSync(report, path.join(root, 'docs/test-evidence/release-0.1-site.json'));
    }
    console.log(`PASS: ${viewports.length}/4 viewports; no overflow, no href="#", Google Fonts only.`);
    console.log(`Font request failures: ${failures.length}.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });