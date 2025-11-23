// index.js (im rio-scrapper Repo)
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 10000;

// einfache Health-Route
app.get('/', (req, res) => {
  res.json({ ok: true, msg: 'rio-scrapper up' });
});

/**
 * GET /character
 *  ?region=eu&realm=blackmoore&name=Bukitos&season=season-tww-3
 *
 * Antwort: JSON mit 2+/5+/10+ Timed Runs + Scores
 */
app.get('/character', async (req, res) => {
  const region = (req.query.region || 'eu').toLowerCase();
  const realm  = (req.query.realm  || '').toLowerCase();
  const name   = req.query.name || '';
  const season = req.query.season || 'season-tww-3';

  if (!realm || !name) {
    return res.status(400).json({
      ok: false,
      error: 'Bitte name und realm als Query-Parameter angeben.'
    });
  }

  const charUrl =
    `https://raider.io/characters/${encodeURIComponent(region)}` +
    `/${encodeURIComponent(realm)}/${encodeURIComponent(name)}` +
    `?season=${encodeURIComponent(season)}`;

  console.log('[scraper] Lade:', charUrl);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(charUrl, {
      waitUntil: 'networkidle2',
      timeout: 60_000
    });

    const result = await page.evaluate(() => {
      // Hilfsfunktion: nimmt z.B. die Kachel "10+ Keystone / Timed Runs"
      // und gibt die große Zahl (z.B. 40) zurück.
      function extractBucket(label) {
        const elems = Array.from(
          document.querySelectorAll('div, section, article, span')
        );

        for (const el of elems) {
          const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
          if (!text.toLowerCase().includes('timed runs')) continue;
          if (!text.includes(label)) continue;

          const nums = text.match(/[\d,]+/g) || [];
          const numeric = nums
            .map(n => parseInt(n.replace(/,/g, ''), 10))
            .filter(n => !Number.isNaN(n));

          if (numeric.length) {
            // In "40 10+ Keystone Timed Runs" stehen 40 und 10.
            // Wir wollen die größere Zahl → 40.
            return Math.max(...numeric);
          }
        }
        return 0;
      }

      function extractScore(label) {
        const elems = Array.from(
          document.querySelectorAll('div, section, article, span')
        );

        for (const el of elems) {
          const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
          if (!text.includes(label)) continue;

          const nums =
            text.match(/[\d,]+\.\d+|[\d,]+/g) || []; // z.B. "2,897.6"
          if (nums.length) {
            return parseFloat(nums[0].replace(/,/g, ''));
          }
        }
        return null;
      }

      const runs10 = extractBucket('10+ Keystone');
      const runs5  = extractBucket('5+ Keystone');
      const runs2  = extractBucket('2+ Keystone');

      const overall     = extractScore('Overall');
      const healerScore = extractScore('Healer');
      const dpsScore    = extractScore('DPS');

      return {
        runs10,
        runs5,
        runs2,
        overall,
        healerScore,
        dpsScore
      };
    });

    const totalRuns =
      (result.runs10 || 0) + (result.runs5 || 0) + (result.runs2 || 0);

    await browser.close();

    return res.json({
      ok: true,
      region,
      realm,
      name,
      season,
      totalRuns,
      runs10plus: result.runs10 || 0, // 10+ Kachel
      runs5plus: result.runs5 || 0,   // 5+  Kachel
      runs2plus: result.runs2 || 0,   // 2+  Kachel
      overallScore: result.overall,
      healerScore: result.healerScore,
      dpsScore: result.dpsScore
    });
  } catch (err) {
    console.error('[scraper] Fehler:', err);
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
    return res.status(500).json({
      ok: false,
      error: err.message || String(err)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper läuft auf Port ${PORT}`);
});
