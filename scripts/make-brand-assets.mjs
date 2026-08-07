// Regenerates public/ icons and the OG image from scripts/*-source.html.
//
// Playwright is not a project dependency (only needed to rebuild these):
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/make-brand-assets.mjs
import { chromium } from "playwright";
import { resolve } from "path";

const PUB = resolve("public") + "/";
const ICON_SRC = "file://" + resolve("scripts/icon-source.html");
const OG_SRC = "file://" + resolve("scripts/og-source.html");

const browser = await chromium.launch();

for (const [file, size, square] of [
  ["favicon-32.png", 32, false],
  ["favicon-192.png", 192, false],
  ["favicon-512.png", 512, false],
  // Apple adds its own rounding, so ship a full-bleed square.
  ["apple-touch-icon.png", 180, true],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(`${ICON_SRC}?s=${size}&pad=${square ? 1 : 0}`);
  await page.screenshot({ path: PUB + file, omitBackground: !square });
  await page.close();
}

const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.goto(OG_SRC);
await og.screenshot({ path: PUB + "og-image.png" });
await og.close();

await browser.close();
console.log("brand assets written to public/");
