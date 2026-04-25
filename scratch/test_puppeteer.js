const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: true });
    console.log("Browser launched successfully!");
    const page = await browser.newPage();
    await page.goto('https://example.com');
    console.log("Page title:", await page.title());
    await browser.close();
    console.log("Test finished.");
  } catch (err) {
    console.error("Puppeteer test failed:", err);
  }
})();
