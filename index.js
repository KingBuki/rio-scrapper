// index.js
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// 👉 Hier legen wir fest, wo Chrome liegt (Render + Puppeteer-Cache)
const CHROME_EXECUTABLE_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH || // falls du es in Render als Env-Var setzt
  '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';

// einfache Health-Route
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'rio-scrapper online' });
});

/**
 * Holt von raider.io die Saison-Übersicht (All Runs, 10+, 5+, 2+)
 * per Headless-Browser.
 */
async function scrapeCharacterStats({ region, realm, name, season }) {
  const url =
    `https://raider.io/characters/` +
    `${encodeURIComponent(region)}/` +
    `${encodeURIComponent(realm)}/` +
    `${encodeURIComponent(name)}?` +
    `season=${encodeURIComponent(season)}`;

  let browser;
  try {
    console.log('[scraper] Rufe URL auf:', url);
    console.log('[scraper] Nutze Chrome-Pfad:', CHROME_EXECUTABLE_PATH);

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_EXECUTABLE_PATH,  // 👈 WICHTIG FÜR RENDER
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Jetzt im gerenderten DOM nach den Zahlen suchen
    const stats = await page.evaluate(() => {
      // Wir suchen nach Labels wie "All Runs", "10+ Runs", "5+ Runs", "2+ Runs"
      const root = document.body;

      const findValueByLabel = (labelText) => {
        const candidates = Array.from(
          root.querySelectorAll('span, div, p, strong')
        );

        // Label-Knoten mit genau diesem Text
        const labelNode = candidates.find(
          (el) => el.textContent.trim() === labelText
        );
        if (!labelNode) return null;

        // Oft steht der Wert im gleichen Container z.B. als <strong>
        const parent =
          labelNode.closest('div, span, p') || labelNode.parentElement;
        if (!parent) return null;

        // Suche im gleichen Container nach einem "Zahl"-Element
        const valueNode =
          parent.querySelector('strong') ||
          parent.querySelector('span') ||
          parent.querySelector('div');

        if (!valueNode) return null;

        const text = valueNode.textContent.replace(/,/g, '').trim();
        const num = parseInt(text, 10);
        if (Number.isNaN(num)) return null;
        return num;
      };

      const totalRuns  = findValueByLabel('All Runs')  ?? 0;
      const runs10plus = findValueByLabel('10+ Runs') ?? 0;
      const runs5plus  = findValueByLabel('5+ Runs')  ?? 0;
      const runs2plus  = findValueByLabel('2+ Runs')  ?? 0;

      return { totalRuns, runs10plus, runs5plus, runs2plus };
    });

    return {
      ok: true,
      url,
      ...stats
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}

// API-Route: /character?region=eu&realm=blackmoore&name=Bukitos&season=season-tww-3
app.get('/character', async (req, res) => {
  const {
    region = 'eu',
    realm,
    name,
    season = 'season-tww-3'
  } = req.query;

  if (!realm || !name) {
    return res.status(400).json({
      ok: false,
      error: 'Parameter "realm" und "name" sind erforderlich.'
    });
  }

  try {
    const data = await scrapeCharacterStats({ region, realm, name, season });
    return res.json(data);
  } catch (err) {
    console.error('[scraper] Fehler beim /character-Request:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || String(err)
    });
  }
});

app.listen(PORT, () => {
  console.log(`rio-scrapper listening on port ${PORT}`);
});
