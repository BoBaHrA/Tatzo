const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(path.join(process.env.TATZO_REVIEW_TOOL_ROOT, 'node_modules/playwright'));

const root = path.resolve('dist/profile-review');
const output = path.resolve('dist/profile-screenshots');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try { const body = await fs.readFile(target); res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});

(async () => {
  await fs.mkdir(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const failures = [];
  try {
    for (const scenario of [
      { name: 'public-profile-393', width: 393, query: '' },
      { name: 'own-profile-393', width: 393, query: '?own=1' },
      { name: 'long-name-320', width: 320, query: '?long=1' },
      { name: 'own-profile-320', width: 320, query: '?own=1' },
      { name: 'own-profile-ru-320', width: 320, query: '?own=1&lang=ru' },
      { name: 'map-card-320', width: 320, query: '?map=1' },
      { name: 'map-card-ru-393', width: 393, query: '?map=1&lang=ru' },
    ]) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: 852 }, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/' + scenario.query, { waitUntil: 'networkidle' });
      await page.getByText(scenario.query.includes('long') ? 'MedusaTattooClermontFerrandStudio' : 'MedusaTattoo', { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => {
        const outside = box => box.left < -1 || box.right > window.innerWidth + 1;
        const positive = box => box.right > box.left && box.bottom > box.top;
        const describe = (element, box) => ({
          tag: element.tagName, text: element.textContent?.slice(0, 70),
          box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
        });
        const rawOverflow = [];
        const visibleOverflow = [];
        const buttonOverflow = [];
        for (const element of document.querySelectorAll('body *')) {
          const box = element.getBoundingClientRect();
          if (!positive(box)) continue;
          if (outside(box)) rawOverflow.push(describe(element, box));
          const visible = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
          let hidden = false;
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
              hidden = true;
              break;
            }
            if (ancestor === element) continue;
            const clip = ancestor.getBoundingClientRect();
            // ImageBackground uses an oversized, clipped background plus an
            // invisible intrinsic-size image. Only painted overflow is a defect.
            if (/^(hidden|clip|auto|scroll)$/.test(style.overflowX)) {
              visible.left = Math.max(visible.left, clip.left);
              visible.right = Math.min(visible.right, clip.right);
            }
            if (/^(hidden|clip|auto|scroll)$/.test(style.overflowY)) {
              visible.top = Math.max(visible.top, clip.top);
              visible.bottom = Math.min(visible.bottom, clip.bottom);
            }
          }
          if (hidden || !positive(visible)) continue;
          if (outside(visible)) visibleOverflow.push(describe(element, visible));
          // A clipped control still needs to fit: do not hide a genuine layout
          // regression simply because a ScrollView masks part of the button.
          if (element.matches('button, [role="button"]') && outside(box)) buttonOverflow.push(describe(element, box));
        }
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          rawOverflow, visibleOverflow, buttonOverflow,
        };
      });
      const result = { ...scenario, runtimeErrors: errors, layout };
      results.push(result);
      // Always preserve the rendered evidence before any assertion can fail.
      await page.screenshot({ path: path.join(output, scenario.name + '.png'), fullPage: true });
      try {
        assert.deepEqual(errors, [], scenario.name + ' runtime errors');
        assert.deepEqual(layout.visibleOverflow, [], scenario.name + ' visible horizontal overflow');
        assert.deepEqual(layout.buttonOverflow, [], scenario.name + ' clipped buttons');
        assert.ok(layout.documentWidth <= scenario.width + 1, scenario.name + ' document horizontal overflow');
        if (!scenario.query.includes('map')) {
          for (const [containerId, childId] of [
            ['profile-identity', 'profile-verified-mark'],
            ['profile-portfolio-card', 'profile-portfolio-icon'],
            ['profile-booking-card', 'profile-booking-icon'],
          ]) {
            const parent = await page.getByTestId(containerId).boundingBox();
            const child = await page.getByTestId(childId).boundingBox();
            assert.ok(parent && child && child.width >= 18 && child.height >= 18, scenario.name + ' displays ' + childId);
            assert.ok(child.x >= parent.x - 1 && child.x + child.width <= parent.x + parent.width + 1
              && child.y >= parent.y - 1 && child.y + child.height <= parent.y + parent.height + 1,
            scenario.name + ' contains ' + childId + ' inside ' + containerId);
          }
          const boxes = await Promise.all(['Tattoo', 'Portfolio', 'Blackwork'].map(label => page.getByRole('button', { name: label, exact: true }).boundingBox()));
          assert.ok(boxes.every(Boolean), scenario.name + ' displays all three posts');
          const tops = boxes.map(box => box.y);
          assert.ok(Math.max(...tops) - Math.min(...tops) < 1, scenario.name + ' keeps all three post columns');
        } else {
          const button = page.getByRole('button', { name: scenario.query.includes('lang=ru') ? 'Другие действия' : 'Plus d’options', exact: true });
          await button.click();
          await page.getByText(scenario.query.includes('lang=ru') ? 'Сообщить о закрытом или устаревшем адресе' : 'Signaler un lieu fermé ou obsolète', { exact: true }).waitFor();
          await page.screenshot({ path: path.join(output, scenario.name + '-menu.png'), fullPage: true });
        }
      } catch (error) {
        result.failure = error.message;
        failures.push(scenario.name + ': ' + error.message);
      }
      await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(results, null, 2));
      await page.close();
    }
    await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(results, null, 2));
    assert.deepEqual(failures, [], 'Native component visual review');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
