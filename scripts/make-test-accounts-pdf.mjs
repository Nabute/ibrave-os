// Renders docs/test-accounts.pdf.html to docs/ibrave-OS-test-accounts.pdf.
//
// Playwright is not a project dependency (it is only needed to rebuild this
// one document), so install it on demand:
//
//   npx --yes playwright@latest install chromium
//   npm i --no-save playwright && node scripts/make-test-accounts-pdf.mjs
//
// Edit the copy in docs/test-accounts.pdf.html, then re-run this to refresh
// the PDF. Keep docs/test-accounts.md in step with it.
import { chromium } from "playwright";
import { resolve } from "path";

const SRC = resolve("docs/test-accounts.pdf.html");
const OUT = resolve("docs/ibrave-OS-test-accounts.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + SRC);
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: OUT,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  margin: { top: "18mm", right: "16mm", bottom: "20mm", left: "16mm" },
  headerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#8a8478;display:flex;justify-content:space-between;">
      <span>ibrave OS &middot; Test Accounts &amp; Scenarios</span><span>Confidential</span></div>`,
  footerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#8a8478;display:flex;justify-content:space-between;">
      <span>os.ibrave.co</span><span class="pageNumber"></span></div>`,
});
await browser.close();
console.log("wrote", OUT);
