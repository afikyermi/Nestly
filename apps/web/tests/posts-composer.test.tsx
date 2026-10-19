// I3 F3.1b criteria 15 and 16 (unit): the composer's audience memory and accessibility wiring. Derived from .work/post-create/spec.md and
// screen.md (roles and Hebrew names) only. The journey (publish, land, edit, delete) is e2e/posts.spec.ts. Seams: the posting-right,
// own-user-id and session hooks and the posts API are replaced; the audience storage is the provider the composer reads.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposeScreen } from '@/features/posts/ComposeScreen';
import { AudienceStorageContext } from '@/hooks/use-audience-memory';
import type { StorageLike } from '@/platform/browser-storage';

const USER = 'f0000000-0000-4000-8000-0000000000f1';
const createPost = vi.fn();

vi.mock('@/hooks/use-posting-right', () => ({ usePostingRight: () => 'allowed' }));
vi.mock('@/hooks/use-own-user-id', () => ({ useOwnUserId: () => ({ kind: 'known', userId: USER }) }));
vi.mock('@/hooks/use-session-account', () => ({
  useSessionAccount: () => ({ getAccessToken: () => Promise.resolve('tok'), recheck: () => Promise.resolve() }),
}));
vi.mock('@/services/api/posts', () => ({ createPost: (...args: unknown[]): unknown => createPost(...args) }));

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const published = { id: 'd0000000-0000-4000-8000-000000000001', body: 'x', audience: 'everyone', stageTag: null, createdAt: '2026-06-15T09:00:00.000Z' };

function mount(storage: StorageLike | undefined) {
  return render(
    <AudienceStorageContext.Provider value={() => storage}>
      <MemoryRouter initialEntries={['/posts/new']}>
        <Routes>
          <Route path="/posts/new" element={<ComposeScreen />} />
          <Route path="/posts/:id" element={<p>post page</p>} />
        </Routes>
      </MemoryRouter>
    </AudienceStorageContext.Provider>,
  );
}
const everyone = () => screen.getByRole('radio', { name: 'כולם' });
const friends = () => screen.getByRole('radio', { name: 'חברים בלבד' });
const text = () => screen.getByRole('textbox', { name: 'מה תרצו לשתף?' });
const type = (value: string) => fireEvent.change(text(), { target: { value } });
const publish = () => screen.getByRole('button', { name: 'פרסום' });
const stored = (s: ReturnType<typeof memoryStorage>) => [...s.data.entries()];

beforeEach(() => {
  createPost.mockReset();
});

describe('F3.1b c15 [OP-033 Afik 1א] the audience choice and its memory', () => {
  it('[c15] the radio group "מי יראה את הפוסט" has "כולם" checked and "חברים בלבד" when nothing is stored', async () => {
    mount(memoryStorage());
    expect(await screen.findByRole('radiogroup', { name: 'מי יראה את הפוסט' })).toBeTruthy();
    expect(everyone()).toHaveProperty('checked', true);
    expect(friends()).toHaveProperty('checked', false);
  });
  /** Produces the stored entry through a real successful "חברים בלבד" post, so the key format is the product's own. */
  async function rememberFriends(storage: ReturnType<typeof memoryStorage>) {
    createPost.mockResolvedValue({ kind: 'post', post: { ...published, audience: 'friends' } });
    const first = mount(storage);
    await screen.findByRole('radiogroup', { name: 'מי יראה את הפוסט' });
    type('שלום');
    await userEvent.click(friends());
    await userEvent.click(publish());
    await screen.findByText('post page');
    expect(stored(storage)).toHaveLength(1);
    first.unmount();
  }
  it.each(['', 'nobody', 'EVERYONE', '{"a":1}'])('[c15] an invalid stored value %j preselects "כולם"', async (bad) => {
    const storage = memoryStorage();
    await rememberFriends(storage);
    for (const [key] of stored(storage)) storage.data.set(key, bad);
    mount(storage);
    await screen.findByRole('radiogroup', { name: 'מי יראה את הפוסט' });
    expect(everyone()).toHaveProperty('checked', true);
  });
  it('[c15] storage that throws or is absent still opens on "כולם"', async () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    mount(broken);
    await screen.findByRole('radiogroup', { name: 'מי יראה את הפוסט' });
    expect(everyone()).toHaveProperty('checked', true);
  });
  it('[c15] a successful post with "חברים בלבד" is remembered under this user id, and the next composer preselects it', async () => {
    const storage = memoryStorage();
    createPost.mockResolvedValue({ kind: 'post', post: { ...published, audience: 'friends' } });
    const first = mount(storage);
    await screen.findByRole('radiogroup', { name: 'מי יראה את הפוסט' });
    type('שלום');
    await userEvent.click(friends());
    await userEvent.click(publish());
    await screen.findByText('post page');
    expect(stored(storage)).toHaveLength(1);
    expect(stored(storage)[0]?.[0]).toContain(USER);
    expect(stored(storage)[0]?.[1]).toBe('friends');
    first.unmount();
    mount(storage);
    await screen.findByRole('radiogroup', { name: 'מי יראה את הפוסט' });
    expect(friends()).toHaveProperty('checked', true);
  });
  it.each([
    ['refused 422', { kind: 'refused', reason: 'body_too_long' }],
    ['403', { kind: 'not-allowed' }],
    ['5xx or network', { kind: 'failed' }],
  ])('[c15] a failed post (%s) stores nothing', async (_name, outcome) => {
    const storage = memoryStorage();
    createPost.mockResolvedValue(outcome);
    mount(storage);
    await screen.findByRole('radiogroup', { name: 'מי יראה את הפוסט' });
    type('שלום');
    await userEvent.click(friends());
    await userEvent.click(publish());
    await waitFor(() => expect(createPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(publish()).toHaveProperty('disabled', false));
    expect(stored(storage)).toEqual([]);
  });
  it('[c15] a stored value of another user id is not used', async () => {
    const storage = memoryStorage();
    await rememberFriends(storage);
    // Re-key the real entry to another user id by swapping this user's id in the key.
    const [key, value] = stored(storage)[0] ?? ['', ''];
    expect(key).toContain(USER);
    storage.data.delete(key);
    storage.data.set(key.replace(USER, 'f0000000-0000-4000-8000-0000000000f2'), value);
    mount(storage);
    await screen.findByRole('radiogroup', { name: 'מי יראה את הפוסט' });
    expect(everyone()).toHaveProperty('checked', true);
  });
});

describe('F3.1b c16 [NFR-A11Y-001 VAL] composer accessibility', () => {
  it('[c16] the textarea has its visible label and dir=rtl; the tag group defaults to "בלי תגית" with the hint; no counter at the start', async () => {
    mount(memoryStorage());
    const field = await screen.findByRole('textbox', { name: 'מה תרצו לשתף?' });
    expect(field.getAttribute('dir')).toBe('rtl');
    const group = screen.getByRole('radiogroup', { name: 'תגית (לא חובה)' });
    expect(group.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(group.getAttribute('aria-describedby') ?? '')?.textContent).toBe('התגית תוצג לקוראים');
    expect(screen.getByRole('radio', { name: 'בלי תגית' })).toHaveProperty('checked', true);
    for (const name of ['מתכננים', 'בהריון', 'יש לנו ילד או ילדה']) expect(screen.getByRole('radio', { name })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(''); // the region is always there (WCAG 4.1.3), silent until 100 left
    expect(screen.getByRole('form', { name: 'כתיבת פוסט' }).getAttribute('aria-describedby')).toBeTruthy();
  });
  it.each([
    [1900, /^נותרו 100 תווים$/],
    [1999, /^נותר תו אחד$/],
    [2000, /^לא נותרו תווים$/],
    [2003, /^הפוסט ארוך ב-3 תווים מהמותר$/],
  ])('[c16] with %i characters typed the polite counter reads %s', async (length, words) => {
    mount(memoryStorage());
    await screen.findByRole('textbox', { name: 'מה תרצו לשתף?' });
    type('א'.repeat(length));
    const counter = screen.getByRole('status');
    expect(counter.textContent?.replace(/ /g, ' ')).toMatch(words);
  });
  it('[c16] the counter is absent at 101 characters left, and counts code points (an emoji is one)', async () => {
    mount(memoryStorage());
    await screen.findByRole('textbox', { name: 'מה תרצו לשתף?' });
    type('א'.repeat(1899));
    expect(screen.getByRole('status').textContent).toBe('');
    type(`${'א'.repeat(1998)}😀`);
    expect(screen.getByRole('status').textContent).toMatch(/נותר תו אחד/);
  });
  it('[c16] empty or spaces: the submit shows the message, links it by aria-describedby, marks aria-invalid, focuses the textbox, sends nothing', async () => {
    mount(memoryStorage());
    await screen.findByRole('textbox', { name: 'מה תרצו לשתף?' });
    type('   ');
    await userEvent.click(publish());
    const field = text();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(field.getAttribute('aria-describedby')?.split(' ').find((id) => document.getElementById(id)?.textContent === 'יש לכתוב משהו לפני הפרסום') ?? '');
    expect(message?.textContent).toBe('יש לכתוב משהו לפני הפרסום');
    expect(document.activeElement).toBe(field);
    expect(createPost).not.toHaveBeenCalled();
  });
  it('[c16] 2,001 characters: the too-long message with the limit, the textbox invalid, nothing sent', async () => {
    mount(memoryStorage());
    await screen.findByRole('textbox', { name: 'מה תרצו לשתף?' });
    type('א'.repeat(2001));
    await userEvent.click(publish());
    expect(screen.getByText('הפוסט ארוך מדי. אפשר לקצר אותו עד 2,000 תווים')).toBeTruthy();
    expect(text().getAttribute('aria-invalid')).toBe('true');
    expect(createPost).not.toHaveBeenCalled();
  });
  it('[c16] once invalid, the message clears when the text becomes valid', async () => {
    mount(memoryStorage());
    await screen.findByRole('textbox', { name: 'מה תרצו לשתף?' });
    await userEvent.click(publish());
    expect(screen.getByText('יש לכתוב משהו לפני הפרסום')).toBeTruthy();
    type('עכשיו יש טקסט');
    expect(screen.queryByText('יש לכתוב משהו לפני הפרסום')).toBeNull();
  });
  it('[c16] while pending the button is "מפרסמים" and disabled, and a double click sends one request', async () => {
    let finish: (value: unknown) => void = () => undefined;
    createPost.mockReturnValue(new Promise((resolve) => void (finish = resolve)));
    mount(memoryStorage());
    await screen.findByRole('textbox', { name: 'מה תרצו לשתף?' });
    type('פעם אחת');
    await userEvent.dblClick(publish());
    const pending = await screen.findByRole('button', { name: 'מפרסמים' });
    expect(pending).toHaveProperty('disabled', true);
    expect(createPost).toHaveBeenCalledTimes(1);
    finish({ kind: 'post', post: published });
    await screen.findByText('post page');
    expect(createPost).toHaveBeenCalledTimes(1);
  });
  it('[c16] the request carries the trimmed text, the audience and stageTag null when "בלי תגית"', async () => {
    createPost.mockResolvedValue({ kind: 'post', post: published });
    mount(memoryStorage());
    await screen.findByRole('textbox', { name: 'מה תרצו לשתף?' });
    type('  שלום  ');
    await userEvent.click(publish());
    await screen.findByText('post page');
    expect(createPost).toHaveBeenCalledWith('tok', { body: 'שלום', audience: 'everyone', stageTag: null });
  });
});

// F3.4 c11 (.work/anonymous-post/spec.md, screen.md "Composer"): the logic half. The visible half (notice swap, focus, keyboard, axe) is e2e/anonymous-post.spec.ts.
describe('F3.4 c11 [FR-FEED-005 r.1 r.3] the anonymous toggle: payload and what is remembered', () => {
  const GROUP = 'מי יראה את הפוסט';
  const toggle = () => screen.getByRole('checkbox', { name: 'פרסום אנונימי' });
  /** The second argument of the first createPost call, as a plain record. */
  const sentPayload = (): Record<string, unknown> => {
    const call: unknown[] = createPost.mock.calls[0] ?? [];
    const sent = call[1];
    return typeof sent === 'object' && sent !== null ? Object.fromEntries(Object.entries(sent)) : {};
  };

  it('[c11] the toggle is unchecked on open; checking it removes the audience group, unchecking brings it back on the earlier choice', async () => {
    mount(memoryStorage());
    await screen.findByRole('radiogroup', { name: GROUP });
    expect(toggle()).toHaveProperty('checked', false);
    await userEvent.click(friends());
    await userEvent.click(toggle());
    expect(toggle()).toHaveProperty('checked', true);
    expect(screen.queryByRole('radiogroup', { name: GROUP })).toBeNull();
    await userEvent.click(toggle());
    expect(screen.getByRole('radiogroup', { name: GROUP })).toBeTruthy();
    expect(friends()).toHaveProperty('checked', true);
  });

  it('[c11] checked: the request carries isAnonymous:true and audience "everyone" (even after "חברים בלבד" was picked first), nothing else about the author', async () => {
    createPost.mockResolvedValue({ kind: 'post', post: { ...published, isAnonymous: true } });
    mount(memoryStorage());
    await screen.findByRole('radiogroup', { name: GROUP });
    type('שאלה רגישה');
    await userEvent.click(friends());
    await userEvent.click(toggle());
    await userEvent.click(publish());
    await screen.findByText('post page');
    expect(createPost).toHaveBeenCalledTimes(1);
    expect(createPost).toHaveBeenCalledWith('tok', expect.objectContaining({ body: 'שאלה רגישה', audience: 'everyone', isAnonymous: true }));
    expect(Object.keys(sentPayload()).filter((k) => /author|user|name|email/i.test(k))).toEqual([]);
  });

  it('[c11] an anonymous post leaves the remembered audience untouched and writes no anonymity flag; the next composer opens unchecked on the earlier choice', async () => {
    const storage = memoryStorage();
    // A real "חברים בלבד" post makes the product's own entry; the anonymous post after it must change nothing.
    createPost.mockResolvedValue({ kind: 'post', post: { ...published, audience: 'friends' } });
    const first = mount(storage);
    await screen.findByRole('radiogroup', { name: GROUP });
    type('ראשון');
    await userEvent.click(friends());
    await userEvent.click(publish());
    await screen.findByText('post page');
    first.unmount();
    const entries = stored(storage);
    expect(entries).toHaveLength(1);

    createPost.mockResolvedValue({ kind: 'post', post: { ...published, isAnonymous: true } });
    const second = mount(storage);
    await screen.findByRole('radiogroup', { name: GROUP });
    expect(friends()).toHaveProperty('checked', true);
    type('שני');
    await userEvent.click(toggle());
    await userEvent.click(publish());
    await screen.findByText('post page');
    second.unmount();
    expect(stored(storage)).toEqual(entries);

    mount(storage);
    await screen.findByRole('radiogroup', { name: GROUP });
    expect(toggle()).toHaveProperty('checked', false);
    expect(friends()).toHaveProperty('checked', true);
  });

  it('[c11] an anonymous post as the first one ever stores nothing at all', async () => {
    const storage = memoryStorage();
    createPost.mockResolvedValue({ kind: 'post', post: { ...published, isAnonymous: true } });
    mount(storage);
    await screen.findByRole('radiogroup', { name: GROUP });
    type('שלום');
    await userEvent.click(toggle());
    await userEvent.click(publish());
    await screen.findByText('post page');
    expect(stored(storage)).toEqual([]);
  });

  it('[c11] a named post does not send isAnonymous:true', async () => {
    createPost.mockResolvedValue({ kind: 'post', post: published });
    mount(memoryStorage());
    await screen.findByRole('radiogroup', { name: GROUP });
    type('שלום');
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    await userEvent.click(publish());
    await screen.findByText('post page');
    const sent = sentPayload();
    expect(sent.isAnonymous ?? false).toBe(false);
    expect(sent.audience).toBe('everyone');
  });

  it('[c11] a failed anonymous post keeps the text and the toggle checked (the F3.1b alert, choices kept)', async () => {
    createPost.mockResolvedValue({ kind: 'failed' });
    mount(memoryStorage());
    await screen.findByRole('radiogroup', { name: GROUP });
    type('הטקסט שלי');
    await userEvent.click(toggle());
    await userEvent.click(publish());
    await screen.findByRole('alert');
    expect(text()).toHaveProperty('value', 'הטקסט שלי');
    expect(toggle()).toHaveProperty('checked', true);
    expect(screen.queryByRole('radiogroup', { name: GROUP })).toBeNull();
  });
});
