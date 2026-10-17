// I2 F2.4c2 the other-user profile screen, the copy-my-link entry point and the relationship actions (real browser, real session
// source, network stubbed). Derived from .work/friends/spec.md only: criteria 25-30, Gate 1 (F2.4c) DR-1 A / DR-O A / Q1, and the
// Gate 1 clarifications for F2.4a (routes, bodies), F2.4b (what is verbatim) and F2.4c1 (viewer response keys, 429 {error:"rate_limited"}).
// Verbatim: the strings the spec quotes ("הפרופיל לא זמין", "העתקת הקישור לפרופיל שלי", "הקישור הועתק", the five action names,
// "החברים של <name>", "חברים משותפים", "נסו שוב", "הבקשה כבר לא זמינה") and F2.3's quoted texts ("בהריון", the empty-journey sentence, the
// age phrases of F2.3 c17, F2.1's gender labels). The copy of the two empty lists, the 429 message and the load-failure message are
// BUILDER's (Q1/Q3), so those are asserted by structure. ASSUMED seams (list in the return): GET /api/profiles/:userId, route /u/:userId,
// the lists' headings are role=heading, an action is a button and a list entry a link whose accessible name carries the person's name.
// The API half (what the viewer API returns, limits, ownership) is apps/server/tests and supabase/tests: not repeated here.
// Visual baselines for the six screens are the entries in e2e/visual-screens.ts.
import { expect, test } from '@playwright/test';
import { APP, MENU_BUTTON, pathOf } from './app-helpers';
import { EMAIL, MOBILE, main, scan } from './support/journeys-stub';
import { AVI, DANA, MIRI, YOSSI } from './support/friends-stub';
import { GENDER_LABEL, ID, OWN_ID, TEXT, friendsOf, setupProfiles } from './support/profiles-stub';
import { BARE, BARE_ID, NOA, NOA_ID, PASSWORD, RAZ, RAZ_ID, base, esc, friendsSection, heading, mutualSection, openProfile, sectionText, settle, signIn, storageDump, text, viewsOf, world } from './support/profiles-fixtures';

test.use({ baseURL: APP, viewport: MOBILE });

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4c2 c25 [§1.4 FR-PRIV-001] the screen shows exactly what the viewer API returned', () => {
  test('[F2.4c2 c25] open B: name, gender, count, both ages in the given order as F2.3 phrases, "בהריון"; both list headings', async ({ page }) => {
    await setupProfiles(page, world());
    await openProfile(page, NOA_ID, NOA);
    const t = await text(page);
    expect(t).toContain(GENDER_LABEL.woman);
    expect(t).toMatch(/\b2\b/);
    const at = ['3 שנים ו-5 חודשים', 'שנה ו-3 חודשים'].map((p) => t.indexOf(p));
    expect(at.every((i) => i >= 0), 'both age phrases').toBe(true);
    expect(at[0]).toBeLessThan(at[1] ?? -1);
    expect(t).toContain(TEXT.pregnant);
    await expect(heading(page, friendsOf(NOA))).toBeVisible();
    await expect(heading(page, TEXT.mutual)).toBeVisible();
  });

  test('[F2.4c2 c25] restricted B (gender and ages null): the count and "בהריון" only; no gender label, no age phrase, no placeholder text', async ({ page }) => {
    await setupProfiles(page, world());
    await openProfile(page, RAZ_ID, RAZ);
    const t = await text(page);
    expect(t).toMatch(/\b2\b/);
    expect(t).toContain(TEXT.pregnant);
    for (const label of [GENDER_LABEL.woman, GENDER_LABEL.man, GENDER_LABEL.prefer_not_to_say]) expect(t, label).not.toContain(label);
    expect(t).not.toMatch(/שנה|שנים|שנתיים|חודש/);
    expect(t).not.toMatch(/undefined|null|NaN|\[object/);
  });

  const GENDERS = [['woman', GENDER_LABEL.woman], ['man', GENDER_LABEL.man], ['other', GENDER_LABEL.other], ['prefer_not_to_say', GENDER_LABEL.prefer_not_to_say]] as const;
  for (const [value, label] of GENDERS) {
    test(`[F2.4c2 c25] gender "${value}" returned: the screen shows "${label}"`, async ({ page }) => {
      const w = world();
      const noa = w[NOA_ID];
      if (noa === undefined) throw new Error('fixture');
      await setupProfiles(page, { ...w, [NOA_ID]: { view: { ...noa.view, gender: value } } });
      await openProfile(page, NOA_ID, NOA);
      expect(await text(page)).toContain(label);
    });
  }

  test('[F2.4c2 c25] ages as returned at the F2.3 phrase boundaries: (0,0) (0,1) (2,0) in order, count 3', async ({ page }) => {
    const w = world({ [NOA_ID]: { view: base(NOA, { childrenCount: 3, childAges: [{ years: 0, months: 0 }, { years: 0, months: 1 }, { years: 2, months: 0 }], isPregnant: false }) } });
    await setupProfiles(page, w);
    await openProfile(page, NOA_ID, NOA);
    const t = await text(page);
    const at = ['פחות מחודש', 'חודש', 'שנתיים'].map((p) => t.indexOf(p));
    expect(at.every((i) => i >= 0), 'all three phrases').toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(t).toMatch(/\b3\b/);
    expect(t).not.toContain(TEXT.pregnant);
  });

  test('[F2.4c2 c25] no children, not pregnant, sentence on: the sentence, no count, no "בהריון"', async ({ page }) => {
    await setupProfiles(page, world({ [BARE_ID]: { view: base(BARE, { gender: null, childrenCount: 0, childAges: [], isPregnant: false, showsEmptyJourneySentence: true, friends: [], mutualFriends: [] }) } }));
    await openProfile(page, BARE_ID, BARE);
    const t = await text(page);
    expect(t).toContain(TEXT.emptySentence);
    expect(t).not.toContain(TEXT.pregnant);
    expect(t, 'no count').not.toMatch(/\d/);
  });

  test('[F2.4c2 c25] no children, not pregnant, sentence off: no Journey Summary item at all', async ({ page }) => {
    await setupProfiles(page, world({ [BARE_ID]: { view: base(BARE, { gender: null, childrenCount: 0, childAges: [], isPregnant: false, showsEmptyJourneySentence: false, friends: [], mutualFriends: [] }) } }));
    await openProfile(page, BARE_ID, BARE);
    const t = await text(page);
    expect(t).not.toContain(TEXT.emptySentence);
    expect(t).not.toContain(TEXT.pregnant);
    expect(t).not.toMatch(/\d/);
  });

  test('[F2.4c2 c25] pregnant only: "בהריון", no count, no sentence', async ({ page }) => {
    await setupProfiles(page, world({ [BARE_ID]: { view: base(BARE, { gender: null, childrenCount: 0, childAges: [], isPregnant: true, showsEmptyJourneySentence: false, friends: [], mutualFriends: [] }) } }));
    await openProfile(page, BARE_ID, BARE);
    const t = await text(page);
    expect(t).toContain(TEXT.pregnant);
    expect(t).not.toContain(TEXT.emptySentence);
    expect(t).not.toMatch(/\d/);
  });

  test('[F2.4c2 c25 Q1] both lists empty: both headings stay, each with its own non-empty text, no entry link', async ({ page }) => {
    await setupProfiles(page, world({ [BARE_ID]: { view: base(BARE, { friends: [], mutualFriends: [] }) } }));
    await openProfile(page, BARE_ID, BARE);
    const f = friendsSection(page, BARE);
    const m = mutualSection(page, BARE);
    const ft = await sectionText(f, friendsOf(BARE));
    const mt = await sectionText(m, TEXT.mutual);
    expect(ft.length, 'friends list has an empty text').toBeGreaterThan(0);
    expect(mt.length, 'mutual list has an empty text').toBeGreaterThan(0);
    expect(ft).not.toBe(mt);
    await expect(f.getByRole('link')).toHaveCount(0);
    await expect(m.getByRole('link')).toHaveCount(0);
  });

  test('[F2.4c2 c25] list entries: each person once, in their own list, as a link to that person\'s /u/:userId', async ({ page }) => {
    await setupProfiles(page, world());
    await openProfile(page, NOA_ID, NOA);
    const f = friendsSection(page, NOA);
    const m = mutualSection(page, NOA);
    for (const who of [DANA, YOSSI]) {
      const link = f.getByRole('link', { name: new RegExp(esc(who.fullName)) });
      await expect(link).toHaveCount(1);
      expect(new URL((await link.getAttribute('href')) ?? '', APP).pathname).toBe(`/u/${who.userId}`);
      await expect(m.getByText(who.fullName)).toHaveCount(0);
    }
    const mutual = m.getByRole('link', { name: new RegExp(esc(MIRI.fullName)) });
    await expect(mutual).toHaveCount(1);
    expect(new URL((await mutual.getAttribute('href')) ?? '', APP).pathname).toBe(`/u/${MIRI.userId}`);
    await expect(f.getByText(MIRI.fullName)).toHaveCount(0);
    await expect(f.getByText(AVI.fullName)).toHaveCount(0);
  });

  test('[F2.4c2 c25] following an entry opens that person (one more viewer call, their name), never showing the previous profile while it loads', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, NOA_ID, NOA);
    let release: () => void = () => undefined;
    net.holdView = new Promise<void>((resolve) => {
      release = resolve;
    });
    await friendsSection(page, NOA).getByRole('link', { name: new RegExp(esc(DANA.fullName)) }).click();
    await expect.poll(() => viewsOf(net, DANA.userId)).toBe(1);
    await settle(page);
    expect(pathOf(page)).toBe(`/u/${DANA.userId}`);
    expect(await page.content(), 'the previous profile is gone while the next loads').not.toContain(NOA);
    release();
    await expect(main(page).getByText(DANA.fullName, { exact: true }).first()).toBeVisible();
  });

  test('[F2.4c2 c25] hostile text in names is shown as text: nothing is injected or executed', async ({ page }) => {
    const evil = '<img src=x onerror="window.__xss=1">';
    const evilFriend = '<b>כותרת</b>';
    await setupProfiles(page, world({ [NOA_ID]: { view: base(evil, { friends: [{ userId: DANA.userId, fullName: evilFriend }] }) } }));
    await openProfile(page, NOA_ID, evil);
    await settle(page);
    expect(await page.evaluate(() => Reflect.has(window, '__xss'))).toBe(false);
    await expect(main(page).locator('img[src="x"], b')).toHaveCount(0);
    await expect(main(page).getByText(evilFriend, { exact: true }).first()).toBeVisible();
  });

  test('[F2.4c2 c25] a name of the longest allowed length (60, VAL full name), unbroken, does not scroll the phone screen sideways', async ({ page }) => {
    const long = 'א'.repeat(60);
    await setupProfiles(page, world({ [NOA_ID]: { view: base(long, { friends: [{ userId: DANA.userId, fullName: long }] }) } }));
    await openProfile(page, NOA_ID, long);
    await scan(page);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4c2 c27 [NFR-SEC-005 FR-AUTH-004 DR-O] guests, fresh calls, sign-out, own link', () => {
  test('[F2.4c2 c27] a Guest opening a profile link lands on Login with no viewer call and no profile text; after login: that profile', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await page.goto(`/u/${NOA_ID}`);
    await expect.poll(() => pathOf(page)).toBe('/login');
    await settle(page);
    expect(net.views, 'no viewer call without a session').toEqual([]);
    expect(await page.content()).not.toContain(NOA);
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(EMAIL);
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'התחברות', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe(`/u/${NOA_ID}`);
    await expect(main(page).getByText(NOA, { exact: true }).first()).toBeVisible();
    expect(net.views).toEqual([NOA_ID]);
    expect(net.viewHadToken).toEqual([true]);
  });

  test('[F2.4c2 c27] every visit calls the API again and shows what it now answers (leave and come back; reload)', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, NOA_ID, NOA);
    expect(viewsOf(net, NOA_ID)).toBe(1);
    await friendsSection(page, NOA).getByRole('link', { name: new RegExp(esc(DANA.fullName)) }).click();
    await expect(main(page).getByText(DANA.fullName, { exact: true }).first()).toBeVisible();
    const stored = net.profiles[NOA_ID];
    if (stored === undefined) throw new Error('fixture');
    stored.view = { ...stored.view, fullName: 'נועה בן דוד-לוי', childrenCount: 3 };
    await page.goBack();
    await expect(main(page).getByText('נועה בן דוד-לוי', { exact: true }).first()).toBeVisible();
    expect(viewsOf(net, NOA_ID), 'Back is a new visit: a second call').toBe(2);
    await page.reload();
    await expect(main(page).getByText('נועה בן דוד-לוי', { exact: true }).first()).toBeVisible();
    expect(viewsOf(net, NOA_ID)).toBe(3);
  });

  test('[F2.4c2 c27] sign-out: no profile text on screen or in local/session storage; Back shows no profile and calls nothing', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await openProfile(page, NOA_ID, NOA);
    await page.getByRole('button', { name: MENU_BUTTON }).click();
    await page.getByRole('button', { name: 'התנתקות', exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe('/');
    const secrets = [NOA, DANA.fullName, YOSSI.fullName, MIRI.fullName, NOA_ID, DANA.userId, '3 שנים'];
    const dump = await storageDump(page);
    const body = await page.evaluate(() => document.body.innerText);
    for (const s of secrets) {
      expect(dump, `storage holds "${s}"`).not.toContain(s);
      expect(body, `screen shows "${s}"`).not.toContain(s);
    }
    const callsBefore = net.views.length;
    await page.goBack();
    await page.waitForLoadState('domcontentloaded');
    await settle(page);
    const back = await page.evaluate(() => document.body.innerText);
    for (const s of secrets) expect(back, `Back shows "${s}"`).not.toContain(s);
    expect(net.views.length, 'Back made no viewer call').toBe(callsBefore);
    expect(pathOf(page)).not.toBe(`/u/${NOA_ID}`);
  });

  test('[F2.4c2 c27 DR-O] my own link opens my own ProfilePage (F2.1) and makes no viewer call', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await signIn(page);
    await page.goto(`/u/${OWN_ID}`);
    await expect.poll(async () => (await text(page)).includes('מין ההורה')).toBe(true);
    expect(await text(page)).toContain('דנה כהן');
    await settle(page);
    expect(net.views, 'no viewer call for the caller\'s own id').toEqual([]);
    for (const verb of [TEXT.send, TEXT.accept, TEXT.remove]) await expect(main(page).getByRole('button', { name: new RegExp(esc(verb)) })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('F2.4c2 c29 [ERR-032 ERR-004 ERR-038] loading, unavailable, rate-limited, failures', () => {
  test('[F2.4c2 c29] while loading no profile is shown (no name, no list, no action, no failure text); then the profile appears', async ({ page }) => {
    const net = await setupProfiles(page, world());
    let release: () => void = () => undefined;
    net.holdView = new Promise<void>((resolve) => {
      release = resolve;
    });
    await signIn(page);
    await page.goto(`/u/${RAZ_ID}`);
    await expect.poll(() => net.views.length).toBeGreaterThan(0);
    await settle(page);
    expect(await page.content()).not.toContain(RAZ);
    await expect(heading(page, TEXT.mutual)).toHaveCount(0);
    await expect(main(page).getByRole('button')).toHaveCount(0);
    expect(await text(page)).not.toContain(TEXT.unavailable);
    release();
    await expect(main(page).getByText(RAZ, { exact: true }).first()).toBeVisible();
  });

  test('[F2.4c2 c29] 404: "הפרופיל לא זמין", nothing of any profile; the same text for an id the server does not know', async ({ page }) => {
    const net = await setupProfiles(page, world());
    net.mode[NOA_ID] = 404;
    await signIn(page);
    for (const id of [NOA_ID, ID(99)]) {
      await page.goto(`/u/${id}`);
      await expect(page.getByText(TEXT.unavailable, { exact: true })).toBeVisible();
      expect(await page.content()).not.toContain(NOA);
      await expect(heading(page, TEXT.mutual)).toHaveCount(0);
      await expect(main(page).getByRole('button')).toHaveCount(0);
    }
  });

  test('[F2.4c2 c29] 429: a general message with no digit, no countdown, no profile, and not the 404 text', async ({ page }) => {
    const net = await setupProfiles(page, world());
    net.mode[NOA_ID] = 429;
    await signIn(page);
    await page.goto(`/u/${NOA_ID}`);
    await expect.poll(() => net.views.length).toBeGreaterThan(0);
    await settle(page);
    const first = await text(page);
    expect(first.trim().length, 'a message').toBeGreaterThan(0);
    expect(first, 'no number anywhere').not.toMatch(/\d/);
    expect(first).not.toContain(TEXT.unavailable);
    expect(await page.content()).not.toContain(NOA);
    await expect(heading(page, TEXT.mutual)).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(await text(page), 'no ticking countdown').toBe(first);
  });

  for (const failure of [500, 'abort'] as const) {
    test(`[F2.4c2 c29] failure (${String(failure)}): a message and "נסו שוב", no profile; retry loads it`, async ({ page }) => {
      const net = await setupProfiles(page, world());
      net.mode[NOA_ID] = failure;
      await signIn(page);
      await page.goto(`/u/${NOA_ID}`);
      const retry = page.getByRole('button', { name: TEXT.retry, exact: true });
      await expect(retry).toBeVisible();
      expect((await text(page)).replace(TEXT.retry, '').trim().length, 'a message beside the button').toBeGreaterThan(0);
      expect(await page.content()).not.toContain(NOA);
      delete net.mode[NOA_ID];
      await retry.click();
      await expect(main(page).getByText(NOA, { exact: true }).first()).toBeVisible();
      await expect(retry).toHaveCount(0);
    });
  }

  test('[F2.4c2 c29 ERR-038] 401 from the viewer API (token no longer accepted): Login with the expired text, no profile', async ({ page }) => {
    const net = await setupProfiles(page, world());
    await signIn(page);
    net.mode[NOA_ID] = 401;
    net.me = 401;
    await page.goto(`/u/${NOA_ID}`);
    await expect.poll(() => pathOf(page)).toBe('/login');
    await expect(page.getByText(TEXT.expired)).toBeVisible();
    expect(await page.content()).not.toContain(NOA);
  });
});

