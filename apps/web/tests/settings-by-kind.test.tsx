// Settings per account kind (FR-SET-001, FR-PRIV-001, FR-NOTIF-002; SRS audit 21.10.2026): a Regular account gets the profile link, the
// profile-privacy form, the blocked list and the notification settings; a Professional edits its Professional profile and has no
// profile-privacy form (FR-PRIV-001 is a Regular profile's, so /api/privacy is never asked); a staff account has no profile, no blocked
// list and no notification settings - only the password links and the terms. No section shows an error for a setting that does not apply.
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountKindProvider, type AccountKindState } from '@/hooks/use-account-kind';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { SettingsPage } from '@/pages/settings/SettingsPage';

const unused = () => Promise.reject(new Error('not used'));
const account: SessionAccount = {
  signInWithPassword: unused,
  signInWithGoogle: unused,
  discardGoogleStart: () => undefined,
  googleAccount: unused,
  recheck: () => Promise.resolve(),
  getAccessToken: () => Promise.resolve('test-token'),
  clearNotice: () => undefined,
  markRecoveryQuestionsSet: () => undefined,
  endAfterPasswordChange: () => Promise.resolve(),
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
let asked: string[] = [];
let kindAnswer = 'professional';
const PRO_CATEGORIES = ['comments', 'shares', 'groups', 'offers', 'reviews', 'followers'].map((category) => ({ category, isEnabled: true }));

beforeEach(() => {
  asked = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, 'http://localhost').pathname;
    asked.push(path);
    if (path === '/api/privacy') return Promise.resolve(json({ profileVisibility: 'open', isEmptyJourneySentenceShown: true, isChildBirthdayShared: true }));
    if (path === '/api/blocks') return Promise.resolve(json({ blocked: [] }));
    if (path === '/api/account/kind') return Promise.resolve(json({ kind: kindAnswer }));
    // the server answers each kind its own categories (FR-NOTIF-002): a Professional's has no Friends and no birthdays
    if (path === '/api/notification-preferences') return Promise.resolve(json({ categories: kindAnswer === 'professional' ? PRO_CATEGORIES : [], friends: [] }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
});
afterEach(() => vi.unstubAllGlobals());

function draw(kind: AccountKindState) {
  return render(
    <SessionAccountContext value={account}>
      <AccountKindProvider value={kind}>
        <MemoryRouter initialEntries={['/settings']}>
          <SettingsPage />
        </MemoryRouter>
      </AccountKindProvider>
    </SessionAccountContext>,
  );
}

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('[FR-SET-001 SRS audit] Settings by account kind', () => {
  it('[FR-PRIV-001] a Regular account: "עריכת פרופיל" opens /profile and the privacy form loads', async () => {
    draw('regular');
    expect(screen.getByRole('link', { name: 'עריכת פרופיל' }).getAttribute('href')).toBe('/profile');
    // I9 (FR-SET-002, AC-183): account deletion is a link in Account
    expect(screen.getByRole('link', { name: 'מחיקת חשבון' }).getAttribute('href')).toBe('/settings/delete-account');
    expect(await screen.findByRole('radiogroup')).toBeTruthy();
    expect(asked).toContain('/api/privacy');
  });

  it('[FR-SET-001 FR-PROFILE-001] a Professional: "עריכת פרופיל" opens its Professional profile; no profile-privacy form, no /api/privacy, no error', async () => {
    draw('professional');
    expect(screen.getByRole('link', { name: 'עריכת פרופיל' }).getAttribute('href')).toBe('/pro/profile');
    // I9 (FR-SET-002, AC-183): a Professional deletes its account from the same link
    expect(screen.getByRole('link', { name: 'מחיקת חשבון' }).getAttribute('href')).toBe('/settings/delete-account');
    expect(headings()).toEqual(expect.arrayContaining(['חשבון', 'פרטיות ואבטחה', 'תנאים ופרטיות']));
    expect(screen.getByRole('link', { name: 'החלפת סיסמה' })).toBeTruthy();
    await screen.findByRole('heading', { level: 2, name: 'התראות' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('button', { name: 'נסו שוב' })).toBeNull();
    expect(asked).not.toContain('/api/privacy');
  });

  it('[FR-SET-001 FR-NOTIF-002 FR-REL-002] a Professional: its own notification categories (no "ימי הולדת") and the blocked list render', async () => {
    kindAnswer = 'professional';
    draw('professional');
    expect(await screen.findByText('ביקורות חדשות על הפרופיל המקצועי')).toBeTruthy();
    expect(screen.getByText('הצעות עזרה שאושרו או נדחו')).toBeTruthy();
    expect(screen.getByText('סיכום שבועי של עוקבים חדשים')).toBeTruthy();
    expect(screen.queryByText(/ימי הולדת/)).toBeNull();
    expect(await screen.findByText('אין משתמשים חסומים. אפשר לחסום משתמש מהפרופיל שלו')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'משתמשים חסומים' })).toBeTruthy();
    expect(asked).toEqual(expect.arrayContaining(['/api/notification-preferences', '/api/blocks']));
  });

  it('[FR-SET-001 FR-NOTIF-002] a staff account: no profile link, no blocked list, no notification settings; the password links and the terms', () => {
    draw('staff');
    expect(screen.queryByRole('link', { name: 'עריכת פרופיל' })).toBeNull();
    // I9 (FR-SET-002, BR-084): a staff account has no self-deletion
    expect(screen.queryByRole('link', { name: 'מחיקת חשבון' })).toBeNull();
    expect(headings()).toEqual(['פרטיות ואבטחה', 'תנאים ופרטיות']);
    expect(screen.getByRole('link', { name: 'שאלות לשחזור סיסמה' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'תנאי השימוש' })).toBeTruthy();
    expect(asked.filter((path) => ['/api/privacy', '/api/blocks', '/api/notification-preferences'].includes(path))).toEqual([]);
  });

  it('[SRS audit] when the kind did not come (unknown or no account), no Regular screen is guessed: an error with "נסו שוב", which asks again', async () => {
    draw('unknown');
    expect(screen.getByText('לא הצלחנו לטעון את ההגדרות. אפשר לנסות שוב')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'עריכת פרופיל' })).toBeNull();
    expect(asked).not.toContain('/api/privacy');
    kindAnswer = 'professional';
    fireEvent.click(screen.getByRole('button', { name: 'נסו שוב' }));
    expect((await screen.findByRole('link', { name: 'עריכת פרופיל' })).getAttribute('href')).toBe('/pro/profile');
    expect(asked).toContain('/api/account/kind');
    expect(asked).not.toContain('/api/privacy');
  });

  it('[SRS audit] a retry that fails again keeps the error; "none" is treated the same', async () => {
    draw('none');
    kindAnswer = 'bogus';
    fireEvent.click(screen.getByRole('button', { name: 'נסו שוב' }));
    expect(await screen.findByRole('button', { name: 'נסו שוב' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('while the kind is unknown yet, the page waits rather than drawing the wrong sections', () => {
    draw('loading');
    expect(screen.queryByRole('link', { name: 'עריכת פרופיל' })).toBeNull();
    expect(asked).toEqual([]);
  });
});
