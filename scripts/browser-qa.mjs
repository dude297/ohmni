// Headless browser QA for the consent gate, lab divider/probe flow, save panel, /account, legal pages and AI-button gating.
// ZERO model calls: /api/extract, /api/explain and mentor /api/review requests are aborted and counted as failures.
// Usage: node [--env-file=.env.local] scripts/browser-qa.mjs [baseUrl=https://multimodal-hackathon-sage.vercel.app]
// Signed-in path (6) runs only when SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set: it creates a
// throwaway @test.invalid user, saves + abandons one investigation, deletes the account via the UI, then admin-cleans up.
// Browser (no repo dependency, same as living-schematic-qa.yml): GUIDED_PLAYWRIGHT_MODULE=file://.../playwright/index.mjs,
// optional GUIDED_BROWSER_EXECUTABLE. Screenshots: BROWSER_QA_OUTPUT_DIR (default work/browser-qa).
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const { chromium } = await import(process.env.GUIDED_PLAYWRIGHT_MODULE || 'playwright');

const base = (process.argv[2] || process.env.BASE_URL || 'https://multimodal-hackathon-sage.vercel.app').replace(/\/$/, '');
const out = process.env.BROWSER_QA_OUTPUT_DIR || 'work/browser-qa';
mkdirSync(out, { recursive: true });
const ZOD_PROBE = /script-src blocked eval|'unsafe-eval' is not an allowed source|unsafe-eval/;
const FIT = "Measurements don't match any modelled single fault";
const CONSENT_NEEDED = 'Tick the AI processing consent box to use this AI feature.';
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ headless: true, ...(process.env.GUIDED_BROWSER_EXECUTABLE && { executablePath: process.env.GUIDED_BROWSER_EXECUTABLE }) });
const modelCalls = [];

async function context(init) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'}`));
  });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  // Hard guard: never let the browser reach a model route.
  await ctx.route(/\/api\/(extract|explain|review)(\?|$)/, (route) => {
    const r = route.request();
    if (r.url().includes('/api/review') && !(r.postData() ?? '').includes('mentor')) return route.continue();
    modelCalls.push(r.url());
    return route.abort();
  });
  return ctx;
}

function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => m.type() === 'error' && !ZOD_PROBE.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`http ${r.status()} ${r.url().replace(base, '').split('?')[0]}`));
  return async () => [...errors, ...(await page.evaluate(() => window.__csp).catch(() => [])).filter((v) => !ZOD_PROBE.test(v)).map((v) => `csp: ${v}`)];
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true }).catch(() => undefined);
const frame = (page) => page.locator('.guided-frame:not([hidden])');
const next = (page) => frame(page).getByRole('button', { name: 'Next step' }).click();

// Lab: divider sample → confirm → compare `reading` → investigate. Returns once the compare result is visible.
async function labToInvestigate(page, reading) {
  await page.goto(`${base}/lab?sample=divider`, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox', { name: 'I verified values, terminals and ground' }).check();
  await next(page);
  await page.locator('#measured-vout').fill(reading);
  await frame(page).locator('.solve-button').click();
  await page.waitForSelector('.voltage-result', { timeout: 20_000 });
  const result = await page.locator('.voltage-result').innerText();
  await next(page);
  return result;
}

const users = [];
let admin;
try {
  // 1. /lab consent gate
  {
    const ctx = await context();
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.goto(`${base}/lab`, { waitUntil: 'networkidle' });
    const upload = page.locator('input[type="file"]');
    const demos = page.getByRole('button', { name: /Clear divider|Unclear junction|Smudged value/ });
    const consent = page.locator('.ai-consent input[type="checkbox"]').first();
    const demoStates = async () => Promise.all((await demos.all()).map((b) => b.isEnabled()));
    check('1 /lab: 3 demo-image buttons present', (await demos.count()) === 3, `${await demos.count()}`);
    check('1 /lab: upload + demo buttons disabled before consent', (await upload.isDisabled()) && (await demoStates()).every((e) => !e));
    await shot(page, '1-lab-no-consent');
    await consent.check();
    check('1 /lab: upload + demo buttons enabled after consent', (await upload.isEnabled()) && (await demoStates()).every(Boolean));
    check('1 /lab: consent stored in sessionStorage', (await page.evaluate(() => sessionStorage.getItem('ohmni.aiConsent'))) === '1');
    await page.reload({ waitUntil: 'networkidle' });
    check('1 /lab: consent survives reload in same tab', (await consent.isChecked()) && (await upload.isEnabled()));
    const e = await errs();
    check('1 /lab: no console errors / CSP violations', e.length === 0, e.join(' | '));
    const ctx2 = await context();
    const page2 = await ctx2.newPage();
    await page2.goto(`${base}/lab`, { waitUntil: 'networkidle' });
    check('1 /lab: fresh context has no consent', !(await page2.locator('.ai-consent input[type="checkbox"]').first().isChecked()) && (await page2.locator('input[type="file"]').isDisabled()));
    await ctx2.close();
    await ctx.close();
  }

  // 2. Divider: 2.50 V, 0.45 V hypotheses + probe guide; 50 V → fit: poor warning, no verdict. 3. Save panel signed out.
  {
    const ctx = await context();
    const page = await ctx.newPage();
    const errs = watch(page);
    const result = await labToInvestigate(page, '0.45');
    check('2 /lab divider: solver expects 2.50 V', /2\.50/.test(result), result.replace(/\s+/g, ' ').slice(0, 120));
    await page.waitForSelector('.investigate-panel .hypothesis-card', { timeout: 10_000 }).catch(() => undefined);
    check('2 /lab 0.45 V: hypotheses shown', (await page.locator('.investigate-panel .hypothesis-card').count()) > 0);
    await page.getByRole('button', { name: 'Guide me', exact: true }).click();
    await page.waitForSelector('.next-probe, .probe-conclusion', { timeout: 20_000 });
    check('2 /lab 0.45 V: probe guide renders next measurement or conclusion', (await page.locator('.next-probe, .probe-conclusion').count()) > 0, (await page.locator('.next-probe h4, .probe-conclusion').first().innerText()).slice(0, 80));
    await shot(page, '2-lab-probe-guide');
    // 3. Save panel (signed out)
    const save = page.locator('.save-panel');
    check('3 /lab: save panel visible after confirming graph', await save.isVisible());
    check('3 /lab: signed-out save panel shows email field', await save.locator('#save-email').isVisible());
    await shot(page, '3-lab-save-panel');

    // fit: poor — impossible 50 V on a 5 V divider
    await page.locator('#investigate-reading').fill('50');
    await page.getByRole('button', { name: /Compare reading/ }).click();
    await page.waitForFunction(() => document.querySelector('.investigation-reading-status')?.textContent?.includes('50 V observed'), null, { timeout: 20_000 });
    await page.getByRole('button', { name: 'Guide me', exact: true }).click();
    await page.waitForSelector('.probe-hypotheses', { timeout: 20_000 });
    let warned = await page.getByText(FIT).isVisible().catch(() => false);
    // If one reading is not enough, keep answering the guide's next probe with impossible readings.
    for (let i = 0; i < 3 && !warned && (await page.locator('#probe-reading').count()); i++) {
      await page.locator('#probe-reading').fill('50');
      await page.getByRole('button', { name: /Update investigation/ }).click();
      await page.waitForTimeout(2_500);
      warned = await page.getByText(FIT).isVisible().catch(() => false);
    }
    await shot(page, '2-lab-fit-poor');
    check('2 /lab 50 V: fit-poor warning shown', warned);
    check('2 /lab 50 V: no confident verdict', (await page.getByText('MODEL RESULT · VERIFY PHYSICALLY').count()) === 0);
    const e = await errs();
    check('2 /lab flow: no console errors / CSP violations', e.length === 0, e.join(' | '));
    await ctx.close();
  }

  // 4. /account, legal pages, footer links
  {
    const ctx = await context();
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
    check('4 /account: sign-in form renders', (await page.locator('#acct-email').isVisible()) && (await page.getByRole('button', { name: 'Send sign-in link' }).isVisible()));
    await shot(page, '4-account');
    for (const p of ['/privacy', '/terms', '/subprocessors', '/security']) {
      const res = await page.goto(base + p, { waitUntil: 'networkidle' });
      check(`4 ${p}: 200 + "Draft for beta" banner`, res.status() === 200 && (await page.getByText('Draft for beta').isVisible()), `${res.status()}`);
      const hrefs = [...new Set(await page.locator('footer a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href'))))];
      const bad = [];
      for (const h of hrefs) { const r = await page.request.get(base + h); if (r.status() !== 200) bad.push(`${h}=${r.status()}`); }
      check(`4 ${p}: footer links resolve (${hrefs.length})`, hrefs.length > 0 && bad.length === 0, bad.join(' '));
    }
    const e = await errs();
    check('4 account/legal: no console errors / CSP violations', e.length === 0, e.join(' | '));
    await ctx.close();
  }

  // 5. AI buttons gated on /probe, /review, voice-lab
  {
    const ctx = await context();
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.goto(`${base}/probe`, { waitUntil: 'networkidle' });
    await page.locator('summary:has(#tutor-h)').click();
    const pb = page.getByRole('button', { name: /Explain this circuit/ });
    check('5 /probe: Explain disabled without consent + reason shown', (await pb.isDisabled()) && (await page.getByText(CONSENT_NEEDED).isVisible()));
    await page.locator('.ai-consent input[type="checkbox"]').first().check();
    check('5 /probe: Explain enabled after consent, reason hidden', (await pb.isEnabled()) && !(await page.getByText(CONSENT_NEEDED).isVisible()));
    await page.locator('.ai-consent input[type="checkbox"]').first().uncheck();

    await page.goto(`${base}/review`, { waitUntil: 'networkidle' });
    await page.locator('#rv-confirm').check();
    await page.getByRole('button', { name: 'Run review' }).click();
    await page.waitForSelector('[aria-label="Findings"]', { timeout: 20_000 });
    const rb = page.getByRole('button', { name: /Explain with AI/ });
    check('5 /review: mentor buttons disabled without consent + reason shown', (await rb.count()) > 0 && (await rb.first().isDisabled()) && (await page.getByText(CONSENT_NEEDED).isVisible()), `${await rb.count()} buttons`);
    await shot(page, '5-review');

    await page.goto(`${base}/for-the-larp/voice-lab`, { waitUntil: 'networkidle' });
    const vb = page.getByRole('button', { name: /Explain \(Gemini\)/ });
    check('5 voice-lab: Explain disabled without consent', (await vb.count()) === 1 && (await vb.isDisabled()));
    check('5 voice-lab: one-line consent reason shown', await page.getByText(CONSENT_NEEDED).isVisible());
    await shot(page, '5-voice-lab');
    const e = await errs();
    check('5 probe/review/voice-lab: no console errors / CSP violations', e.length === 0, e.join(' | '));
    await ctx.close();
  }

  // 6. Signed-in path with a throwaway user (never the DEMO account)
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  if (!url || !anon || !service) console.log('SKIP 6 signed-in path (no SUPABASE_* env)');
  else {
    const opts = { auth: { persistSession: false, autoRefreshToken: false } };
    admin = createClient(url, service, opts);
    const email = `browser-qa-${randomBytes(4).toString('hex')}@test.invalid`;
    const password = randomBytes(18).toString('base64url');
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(created.user.id);
    const { data: s, error: e2 } = await createClient(url, anon, opts).auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    // supabase-js v2 browser storage: localStorage["sb-<project ref>-auth-token"] = JSON session.
    const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    const ctx = await context({ fn: ([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch {} }, arg: [key, JSON.stringify(s.session)] });
    const page = await ctx.newPage();
    const errs = watch(page);
    await labToInvestigate(page, '0.45');
    const save = page.locator('.save-panel');
    await save.getByText(`Signed in as ${email}`).waitFor({ timeout: 15_000 }).catch(() => undefined);
    check('6 /lab signed in: save panel shows the throwaway user', await save.getByText(`Signed in as ${email}`).isVisible());
    await save.getByRole('button', { name: /Save confirmed circuit/ }).click();
    await save.getByText(/Saved \d+ reading/).waitFor({ timeout: 30_000 }).catch(() => undefined);
    const savedText = await save.locator('[role="status"]').first().innerText().catch(() => '');
    check('6 /lab: investigation saved', /Saved \d+ reading/.test(savedText), savedText.slice(0, 120));
    await save.locator('#close-status').selectOption('abandoned').catch(() => undefined);
    await save.getByRole('button', { name: /Close investigation/ }).click().catch(() => undefined);
    await save.getByText('Investigation abandoned.').waitFor({ timeout: 20_000 }).catch(() => undefined);
    check('6 /lab: investigation closed as abandoned', await save.getByText('Investigation abandoned.').isVisible());
    await shot(page, '6-lab-saved');

    await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
    await page.getByText('Loading workspaces…').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
    const cards = page.locator('.card');
    check('6 /account: workspaces list renders the saved workspace', (await cards.count()) >= 1 && (await cards.first().innerText()).includes('owner'), `${await cards.count()} card(s)`);
    await cards.first().locator('summary').click();
    await page.getByRole('heading', { name: 'Members' }).waitFor({ timeout: 15_000 }).catch(() => undefined);
    check('6 /account: team panel opens with Members + Activity log + AI usage',
      (await page.getByRole('heading', { name: 'Members' }).isVisible()) && (await page.getByRole('heading', { name: 'Activity log' }).isVisible()) && (await page.getByRole('heading', { name: /AI usage/ }).isVisible()));
    await page.waitForTimeout(1_500);
    await shot(page, '6-account-team');
    await page.locator('#acct-del').fill(email);
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await page.getByText(/Your account was deleted/).waitFor({ timeout: 20_000 }).catch(() => undefined);
    const deleted = await page.getByText(/Your account was deleted/).isVisible();
    check('6 /account: delete-my-account via UI succeeds', deleted, deleted ? await page.getByText(/Your account was deleted/).innerText() : '');
    if (deleted) {
      const { data } = await admin.auth.admin.getUserById(users[0]);
      if (!data?.user) users.pop();
    }
    // Expected: signOut after the account is gone gets 403 from GoTrue (session already invalid); supabase-js still clears it.
    const e = (await errs()).filter((v) => !/auth\/v1\/logout|status of 403/.test(v));
    check('6 signed-in path: no console errors / CSP violations', e.length === 0, e.join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('run completed without exception', false, e.message.split('\n')[0]);
} finally {
  for (const id of users) {
    const { data: m } = await admin.from('workspace_members').select('workspace_id').eq('user_id', id);
    for (const { workspace_id } of m ?? []) await admin.from('workspaces').delete().eq('id', workspace_id);
    const { error } = await admin.auth.admin.deleteUser(id);
    check(`cleanup user ${id} (+${m?.length ?? 0} workspace(s))`, !error, error?.message);
  }
  await browser.close();
}
check('zero model calls attempted', modelCalls.length === 0, modelCalls.join(' '));
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
