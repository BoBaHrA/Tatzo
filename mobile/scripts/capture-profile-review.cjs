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
  try {
    for (const scenario of [
      { name: 'public-profile-393', width: 393, query: '' },
      { name: 'own-profile-393', width: 393, query: '?own=1' },
      { name: 'long-name-320', width: 320, query: '?long=1' },
      { name: 'map-card-320', width: 320, query: '?map=1' },
      { name: 'map-card-ru-393', width: 393, query: '?map=1&lang=ru' },
    ]) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: 852 }, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/' + scenario.query, { waitUntil: 'networkidle' });
      await page.getByText(scenario.query.includes('long') ? 'MedusaTattooClermontFerrandStudio' : 'MedusaTattoo', { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.left < -1 || box.right > window.innerWidth + 1);
      }).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 70) })));
      assert.deepEqual(errors, [], scenario.name + ' runtime errors');
      assert.deepEqual(overflow, [], scenario.name + ' horizontal overflow');
      if (!scenario.query.includes('map')) {
        const tops = await Promise.all(['Tattoo', 'Portfolio', 'Blackwork'].map(label => page.getByRole('button', { name: label, exact: true }).boundingBox().then(box => box.y)));
        assert.ok(Math.max(...tops) - Math.min(...tops) < 1, scenario.name + ' keeps all three post columns');
      } else {
        const button = page.getByRole('button', { name: scenario.query.includes('lang=ru') ? 'Другие действия' : 'Plus d’options', exact: true });
        await button.click();
        await page.getByText(scenario.query.includes('lang=ru') ? 'Сообщить о закрытом или устаревшем адресе' : 'Signaler un lieu fermé ou obsolète', { exact: true }).waitFor();
      }
      await page.screenshot({ path: path.join(output, scenario.name + '.png'), fullPage: true });
      results.push({ ...scenario, runtimeErrors: errors, horizontalOverflow: overflow });
      await page.close();
    }
    await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
