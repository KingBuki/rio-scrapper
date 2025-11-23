// index.js
const express = require('express');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 3000;

// 🔧 Chrome-Pfad NICHT mehr hardcoden – Puppeteer weiß selbst, wo es installiert hat
function getChromeExecutablePath() {
  try {
    const p = puppeteer.executablePath();
    console.log('[scraper] puppeteer.executablePath() =', p);
    return p;
  } catch (e) {
    console.warn('[scraper] executablePath() nicht verfügbar, versuche Default.');
    return undefined;
  }
}

// 🔍 eigentliche Scrape-Funktion
async function scrapeCharacterStats({ region, realm, name, season }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: getChromeExecutablePath(), // ✅ Pfad von Puppeteer selbst
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();

    const url = `https://raider.io/characters/${encodeURIComponent(
      region
    )}/${encodeURIComponent(realm)}/${encodeURIComponent(
      name
    )}?season=${encodeURIComponent(season)}`;

    console.log('[scraper] Aufruf URL:', url);

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // 🧠 Scraping-Logik – aktuell noch generisch, später feintunen
    const stats = await page.evaluate(() => {
      function findStat(labelVariants) {
        const labelsLower = labelVariants.map((t) => t.toLowerCase());
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
          null
        );

        let node;
        while ((node = walker.nextNode())) {
          const text = (node.textContent || '').trim().toLowerCase();
          if (!text) continue;

          if (labelsLower.some((lbl) => text.includes(lbl))) {
            let el = node;
            for (let i = 0; i < 3 && el; i++) {
              const nums = Array.from(
                el.querySelectorAll('span, div, strong, b')
              )
                .map((e) =>
                  (e.textContent || '')
                    .replace(/\s+/g, '')
                    .replace(/[^0-9]/g, '')
                )
                .filter((str) => str.length > 0);
              if (nums.length > 0) {
                const val = parseInt(nums[0], 10);
                if (!Number.isNaN(val)) return val;
              }
              el = el.parentElement;
            }
          }
        }
        return null;
      }

      return {
        totalRuns: findStat(['total runs', 'gesamtläufe', 'gesamtanzahl']),
        runs10plus: findStat(['10+ runs', '10+ keys', '10+ läufe']),
        runs5plus: findStat(['5+ runs', '5+ keys', '5+ läufe']),
        runs2plus: findStat(['2+ runs', '2+ keys', '2+ läufe'])
      };
    });

    return stats;
  } finally {
    await browser.close();
  }
}

// 🚀 Express-App
const app = express();

// Healthcheck / Info
app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'rio-scrapper is running',
    usage:
      '/character?region=eu&realm=blackmoore&name=Bukitos&season=season-tww-3'
  });
});

// Haupt-Endpoint:
// GET /character?region=eu&realm=blackmoore&name=Bukitos&season=season-tww-3
app.get('/character', async (req, res) => {
  try {
    const {
      region = 'eu',
      realm,
      name,
      season = 'season-tww-3'
    } = req.query;

    if (!realm || !name) {
      return res.status(400).json({
        ok: false,
        error: 'Missing query params: realm and name are required.'
      });
    }

    const stats = await scrapeCharacterStats({
      region,
      realm,
      name,
      season
    });

    if (!stats) {
      return res
        .status(500)
        .json({ ok: false, error: 'Scraping returned no data.' });
    }

    res.json({
      ok: true,
      region,
      realm,
      name,
      season,
      ...stats
    });
  } catch (err) {
    console.error('[scraper] Fehler beim /character-Request:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`rio-scrapper listening on port ${PORT}`);
});
