import { chromium } from '../node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const cs = readFileSync('/tmp/rn-pay-cs.txt', 'utf8').trim();
const out = execSync(`stripe checkout sessions retrieve ${cs}`, {
  encoding: 'utf8',
  maxBuffer: 10_000_000,
});
const session = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
const url = session.url;
if (!url) throw new Error('no url');
console.log('paying', cs.slice(0, 28));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(4000);

// Optional email overwrite if empty
const email = page.locator('input[type="email"]').first();
if (await email.isVisible().catch(() => false)) {
  const v = await email.inputValue().catch(() => '');
  if (!v) await email.fill('buyer@example.test');
}

async function fillCardFields() {
  for (const frame of page.frames()) {
    const number = frame.locator('input[name="number"], input[autocomplete="cc-number"]').first();
    if (!(await number.count()) || !(await number.isVisible().catch(() => false))) continue;
    await number.fill('4242424242424242');
    const exp = frame.locator('input[name="expiry"], input[autocomplete="cc-exp"]').first();
    if (await exp.count()) await exp.fill('12/34');
    const cvc = frame.locator('input[name="cvc"], input[autocomplete="cc-csc"]').first();
    if (await cvc.count()) await cvc.fill('123');
    console.log('filled card');
    return true;
  }
  return false;
}

let filled = false;
for (let i = 0; i < 12 && !filled; i++) {
  filled = await fillCardFields();
  if (!filled) await page.waitForTimeout(700);
}

const name = page.locator('input[name="billingName"], input[autocomplete="cc-name"]').first();
if (await name.isVisible().catch(() => false)) await name.fill('Alex Buyer');

await page.screenshot({ path: '/tmp/rn-checkout-mid.png', fullPage: true });
console.log('filled=', filled);

const pay = page.locator('button[type="submit"]').filter({ hasText: /Pay|Pagar/i }).first();
await pay.click({ force: true, timeout: 20000 });
await page.waitForTimeout(25000);
await page.screenshot({ path: '/tmp/rn-checkout-after.png', fullPage: true });
console.log('final', page.url().slice(0, 160));

const check = execSync(`stripe checkout sessions retrieve ${cs}`, {
  encoding: 'utf8',
  maxBuffer: 10_000_000,
});
const after = JSON.parse(check.match(/\{[\s\S]*\}/)[0]);
console.log('stripe_session', after.status, after.payment_status, after.payment_intent);
writeFileSync('/tmp/rn-pay-result.txt', JSON.stringify(after.payment_status));
await browser.close();
if (after.payment_status !== 'paid') process.exitCode = 2;
