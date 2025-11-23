const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

// Simple test endpoint (Render uses this to check if service is alive)
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "rio-scraper läuft!" });
});

// Beispiel-Route (Scraping kommt später)
app.get("/scrape", async (req, res) => {
  const { name, realm, region } = req.query;
  
  if (!name || !realm || !region) {
    return res.status(400).json({ error: "Missing name, realm or region" });
  }

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    const url = `https://raider.io/characters/${region}/${realm}/${name}`;

    await page.goto(url, { waitUntil: "networkidle2" });

    // Beispiel: Mythic+ Score auslesen
    const score = await page.$eval(
      ".score-text",
      (el) => el.innerText.trim()
    );

    await browser.close();

    res.json({
      name,
      realm,
      region,
      score
    });
  } catch (err) {
    console.error("Scrape error:", err);
    res.status(500).json({ error: "Scrape failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper läuft auf Port ${PORT}`);
});
