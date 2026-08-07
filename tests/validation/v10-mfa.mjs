// V10 — MFA end-to-end: admin mandates MFA for a user → that user is forced
// through TOTP enrollment at login → subsequent login requires a 6-digit code
// → Preferences shows the factor as locked. Uses a real TOTP implementation.
import { chromium } from "playwright";
import { createHmac } from "crypto";
import { mkdirSync } from "fs";

const BASE = "http://localhost:5199";
const OUT = "/private/tmp/claude-501/-Users-infratech-Documents-nabute-ibrave-products-ibrave-os/4230f3c0-91cb-46a4-ba4d-383bb9db9afc/scratchpad/shots-final/";
mkdirSync(OUT, { recursive: true });

function totp(secretB32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretB32.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Math.floor(Date.now() / 30000);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", bytes).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1e6).toString().padStart(6, "0");
  return code;
}

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function login(email, password) {
  await page.goto(BASE + "/");
  await page.waitForSelector("input#email", { timeout: 15000 });
  await page.fill("input#email", email);
  await page.fill("input#password", password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

// ---- 1. owner logs in with NO MFA gate (not mandated) ----------------------
await login("owner@ibrave.co", "password123");
check("owner (not mandated) goes straight to workspace", await page.locator("aside").count() > 0);

// ---- 2. admin: reset test user's password + require MFA --------------------
await page.goto(BASE + "/admin");
await page.waitForTimeout(1500);
const row = page.locator("tr", { hasText: "test.contractor@ibrave.co" });
await row.getByRole("button", { name: "Reset password" }).click();
await page.waitForSelector("code", { timeout: 20000 });
const tempPw = (await page.locator("code").first().textContent()).trim();
check("admin resets test user's password", tempPw.length === 16);
await page.getByRole("button", { name: "Done" }).click();

await row.getByRole("button", { name: "Edit profile" }).click();
await page.waitForTimeout(400);
await page.locator('div[role="dialog"] input[type="checkbox"]').check();
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(1200);
check("admin mandates MFA for the user", true);

// sign out owner
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForTimeout(1500);

// ---- 3. mandated user hits the enrollment gate ------------------------------
await login("test.contractor@ibrave.co", tempPw);
const gateTitle = await page.locator("h1").first().textContent();
check("mandated user is blocked at MFA enrollment", gateTitle?.includes("two-factor"),
  `h1=${gateTitle}`);
await page.screenshot({ path: OUT + "mfa-enroll-gate.png" });

// read the secret, compute a TOTP, activate
await page.waitForSelector("img[alt='TOTP QR code']", { timeout: 20000 });
const secret = (await page.locator("p.break-all").textContent()).trim();
check("enrollment shows QR + secret", secret.length >= 16, `secret len=${secret.length}`);
await page.fill("input#enroll-code", totp(secret));
await page.getByRole("button", { name: "Activate MFA" }).click();
await page.waitForTimeout(3000);
check("after activation the workspace opens", await page.locator("aside").count() > 0);

// ---- 4. next login requires the code ---------------------------------------
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForTimeout(1500);
await login("test.contractor@ibrave.co", tempPw);
const verifyTitle = await page.locator("h1").first().textContent();
check("second login is challenged for a code", verifyTitle?.includes("Two-factor"),
  `h1=${verifyTitle}`);
await page.screenshot({ path: OUT + "mfa-verify-gate.png" });
await page.fill("input#totp", totp(secret));
await page.getByRole("button", { name: "Verify" }).click();
await page.waitForTimeout(3000);
check("correct code opens the workspace", await page.locator("aside").count() > 0);

// ---- 5. Preferences shows the factor locked --------------------------------
await page.goto(BASE + "/settings");
await page.waitForTimeout(1500);
const body = await page.locator("body").textContent();
check("Preferences: factor active + mandated (cannot remove)",
  body.includes("Authenticator app active") && body.includes("Mandatory for your role"));
const removeBtn = page.getByRole("button", { name: "Remove" });
check("Remove button disabled for mandated user", await removeBtn.isDisabled().catch(() => false));
await page.screenshot({ path: OUT + "mfa-preferences.png" });

await browser.close();
console.log(`\nV10 MFA: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
