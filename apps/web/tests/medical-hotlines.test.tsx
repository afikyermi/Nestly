// I3 F3.8 c2, c3, c4 (unit half), c6 (unit half), derived from .work/medical-hotlines/spec.md and screen.md: roles and Hebrew names only. The list is
// read from the one constant the spec names as the seam (MEDICAL_HOTLINES); the journey, the menu and axe are e2e/medical-hotlines.spec.ts.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MEDICAL_HOTLINES } from '@nestly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideAccess } from '@/app/access';
import { MedicalHotlinesPage } from '@/pages/medical-hotlines/MedicalHotlinesPage';

const DISCLAIMER = 'לא תחליף לטיפול רפואי. במצב חירום — 101';

function draw() {
  return render(
    <MemoryRouter initialEntries={['/medical-hotlines']}>
      <MedicalHotlinesPage />
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('F3.8 c2 [AC-109 FR-MENU-002] the page', () => {
  it('[c2] one h1 "פנייה למוקד רפואי" and no h2', () => {
    draw();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פנייה למוקד רפואי');
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });

  it('[c2] a list "מוקדי רפואה" of five links, each href = "tel:" + the entry number exactly, in the constant order', () => {
    draw();
    const list = screen.getByRole('list', { name: 'מוקדי רפואה' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(MEDICAL_HOTLINES.map((h) => `tel:${h.number}`));
    expect(links).toHaveLength(5);
  });

  it('[c2] each link shows the service name and the number as visible text; the number is its own left-to-right run', () => {
    draw();
    const links = within(screen.getByRole('list', { name: 'מוקדי רפואה' })).getAllByRole('link');
    links.forEach((link, i) => {
      const hotline = MEDICAL_HOTLINES[i];
      expect(link.textContent, hotline?.id).toContain(hotline?.label ?? '?');
      const run = within(link).getByText(hotline?.number ?? '?', { exact: true });
      expect(run.getAttribute('dir'), `${hotline?.id} number`).toBe('ltr');
    });
  });

  it('[c2] each link is named "<service>, <number>" (screen.md)', () => {
    draw();
    for (const h of MEDICAL_HOTLINES) expect(screen.getByRole('link', { name: `${h.label}, ${h.number}` }).getAttribute('href')).toBe(`tel:${h.number}`);
  });

  it('[c2] the only interactive controls are the five links: no button, input or other link', () => {
    draw();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });
});

describe('F3.8 c3 [AC-109] the disclaimer', () => {
  it('[c3] "לא תחליף לטיפול רפואי. במצב חירום — 101" verbatim, plain text outside any link, after the h1 and before the list', () => {
    draw();
    const line = screen.getByText(DISCLAIMER, { exact: true });
    expect(line.closest('a')).toBeNull();
    expect(line.closest('[role="link"]')).toBeNull();
    const h1 = screen.getByRole('heading', { level: 1 });
    const list = screen.getByRole('list', { name: 'מוקדי רפואה' });
    expect(h1.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('F3.8 c4 [AC-109] no record or event (unit half; the zero-request journey is e2e)', () => {
  it('[c4] opening the page and activating every link makes no fetch, XHR or beacon and writes no storage', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const beacon = vi.fn();
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const before = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    draw();
    const stop = (event: Event): void => event.preventDefault(); // a tel: navigation is the phone's, not jsdom's
    document.addEventListener('click', stop);
    for (const link of screen.getAllByRole('link')) fireEvent.click(link);
    document.removeEventListener('click', stop);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect([JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })]).toEqual(before);
    vi.unstubAllGlobals();
  });

  it('[c4] the page source attaches no onClick, beacon, analytics, storage or request', () => {
    const web = existsSync(path.resolve(process.cwd(), 'src')) ? process.cwd() : path.resolve(process.cwd(), 'apps/web');
    const dir = path.join(web, 'src/pages/medical-hotlines');
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.stories.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const code = readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(code, file).not.toMatch(/onClick|onPointer|onMouse|onTouch|addEventListener|sendBeacon|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|analytics|track|gtag|navigator\./i);
    }
  });
});

describe('F3.8 c6 [FR-MENU-002 ERR-012 FR-AUTH-004] the path is protected', () => {
  const PATH = '/medical-hotlines';
  it('[c6] signed out → Welcome (ERR-012); loading → neither; signed in and active → renders', () => {
    expect(decideAccess('signed-out', PATH)).toEqual({ kind: 'redirect', to: '/' });
    expect(decideAccess('loading', PATH)).toEqual({ kind: 'loading' });
    expect(decideAccess('signed-in', PATH)).toEqual({ kind: 'render' });
  });
  it('[c6] signed out with an ended session → login, exactly as every protected path', () => {
    expect(decideAccess('signed-out', PATH, true)).toEqual(decideAccess('signed-out', '/friends', true));
  });
  it('[c6] a held account (needsQuestions, mustSetPassword) is redirected exactly as for every other protected path', () => {
    expect(decideAccess('signed-in', PATH, false, true)).toEqual(decideAccess('signed-in', '/friends', false, true));
    expect(decideAccess('signed-in', PATH, false, true)).toEqual({ kind: 'redirect', to: '/recovery-questions' });
    expect(decideAccess('signed-in', PATH, false, false, true)).toEqual(decideAccess('signed-in', '/friends', false, false, true));
    expect(decideAccess('signed-in', PATH, false, false, true)).toEqual({ kind: 'redirect', to: '/set-new-password' });
  });
  it('[c6] the signed-in-no-account state completes registration first', () => {
    expect(decideAccess('signed-in-no-account', PATH)).toEqual(decideAccess('signed-in-no-account', '/friends'));
  });
  it.each(['/medical-hotlines/x', '/Medical-Hotlines', '/medical-hotline', '/medical-hotlines2'])('[c6] the neighbour path %s is not opened by it', (path) => {
    expect(decideAccess('signed-in', path)).toEqual({ kind: 'redirect', to: '/feed' });
    expect(decideAccess('signed-out', path)).toEqual({ kind: 'redirect', to: '/' });
  });
});
