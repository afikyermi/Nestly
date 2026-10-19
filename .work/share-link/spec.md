# share-link (F3.6) — send a link to a post or to Nestly

**Problem**        A Regular user cannot send a helpful post to someone outside the app (WhatsApp, email). Today a signed-out visitor
who opens `/posts/:id` lands on Welcome and loses the post, and nothing guarantees that a link preview reveals nothing of the post.
**Requirements**   FR-FEED-007 (05-functional/feed.md; its share event → I15 by 4א) · BR-064 + 2א (only "everyone" posts) · BR-067 · NFR-PRIV-007 ·
NFR-SEC-005 · NFR-SEC-006 (unguessable id) · AC-080 (link part), AC-082, AC-083 (15-acceptance.md) · FR-AUTH-004 · F2.4c2 c27 (returnTo, profiles)
· Afik 18.10 (Restricted has no relation to sharing) · docs/design/direction.md "דפוסי אינטראקציה" (Afik 19.10). Builds on F3.5's card action and post
page and on F3.7's sheet primitive.
**Scope**          Shared pure link builders · web: "שיתוף קישור" on cards and the post page, ShareSheet in F3.7's primitive (WhatsApp, email, copy, device
share), a side-menu "שיתוף Nestly" (site link), Guest → Login → back to `/posts/:id`, generic preview HTML for `/posts/*` and `/` · server: no-store on post reads.
**Out of scope**   Any new table, link token, short link, revocation or expiry (the post uuid is the id) · Nestly sending email or messages (mailto
and wa.me open the user's own app; no provider) · link click or share events (4א → I15) · og:image · Professional (I11) · links to comments,
profiles, children or anything not a post (BR-064) · return to the post after **registration** (Open) · SSR, middleware or edge functions ·
per-post preview of any kind · QR codes · a share count · changes to who may read a post (RLS unchanged) · building the sheet primitive (F3.7).
**Data touched**   None written. `GET /posts/:id` (F3.1/F3.5) read as is; response headers change (c6).
**Risk flags**     new external surface (public URL, link preview HTML fetched by third-party crawlers) · auth (sign-in redirect) → **Elevated**.

**Acceptance criteria** (U unit · I integration · E e2e · B build-output test; one PR)
1. 🔴 [U] Pure `postLinkOf(origin, unit)`: `${origin}/posts/${id}` for a named `everyone` post, own included; a share → its original's link when
   available and `everyone`, else null; anonymous or `friends` → null. `siteLinkOf(origin)` → `${origin}/`. The URL has no query, user id or text.
2. 🔴 [U] Payloads (fixture body "סוד-123", author name "דנה"): WhatsApp `https://wa.me/?text=` + encoded "פוסט ב-Nestly" + space + URL; email
   `mailto:?subject=` encoded "פוסט ב-Nestly" `&body=` encoded URL; device share `{title:"פוסט ב-Nestly", url}` only. None holds body, name, audience,
   stage tag or date. Site link: the same with "Nestly" in place of "פוסט ב-Nestly".
3. 🎨 [U] "שיתוף קישור" button after "שיתוף בפיד" on a card and the post page exactly when `postLinkOf` ≠ null; absent, never disabled, otherwise
   (BR-064, AC-080). Professional: none.
4. 🎨 [E] ShareSheet in F3.7's primitive (bottom sheet below 1024 px, small window from 1024 px): WhatsApp and email are links (`target=_blank`,
   `rel="noopener noreferrer"` on WhatsApp); "העתקת קישור" button; "אפשרויות נוספות" only when `navigator.share` exists, calling it with c2's object.
   Back, Esc, outside click or "סגירה" close it; the page neither scrolls nor navigates; focus returns to the opener; no network request.
5. 🎨 [E] Copy: `navigator.clipboard.writeText(url)` → polite "הקישור הועתק"; rejection or no Clipboard API → alert and a read-only field "הקישור"
   holding the URL, selected. Device share rejected by the user (AbortError) → nothing shown; another error → the copy fallback.
6. 🔴 [I] NFR-SEC-005: `GET /posts/:id` 200 and 404 responses carry `Cache-Control: private, no-store`; after the author edits audience to
   `friends`, the same non-Friend's next open → 404 (no cached copy served).
7. 🔴 [B+I] AC-083, BR-067, NFR-PRIV-007: the HTML served for `/posts/<uuid>` (no cookie, no JS, crawler User-Agents) is byte-identical for an
   `everyone` post, a `friends` post, an anonymous post and an unknown uuid; it has `og:title` "פוסט ב-Nestly", a fixed `og:description`,
   `og:type` website, robots `noindex`, and no seeded body, name, tag or date. `/` has `og:title` "Nestly". Build test on `dist` + `vercel.json` routing.
8. 🔴 [E] AC-082, FR-AUTH-004: a Guest opening `/posts/<id>` goes to Login carrying it; after email sign-in, and after Google sign-in, lands on
   `/posts/<id>` showing the post. No `/api/posts` request is sent before sign-in (network log). A just-signed-out user keeps F2.4c2 behaviour.
9. 🔴 [U] returnTo allow-list: followed only for `/posts/<uuid>` and the existing profile path; `//evil.example`, `https://evil.example/posts/<uuid>`,
   `/posts/not-a-uuid`, `/posts/<uuid>/../settings`, `%2F%2Fevil.example`, backslash forms → the signed-in landing.
10. 🔴 [E] AC-082, NFR-SEC-005: a signed-in Regular opening a link to a post edited to `friends` (non-Friend), deleted, by a suspended author, or an
    unknown uuid → "הפוסט אינו זמין" with "חזרה לפיד", identical in DOM; a Professional or suspended viewer → the same, no post data in DOM or store.
11. 🎨 [E] Site link: side menu item "שיתוף Nestly" opens the ShareSheet titled "שיתוף Nestly" with `siteLinkOf`; same options and closing as c4.
12. 🎨 [E] axe 0 at 375 px and 1280 px on the ShareSheet (post and site); options ≥44×44 px, visible focus, focus trap, initial focus on the first option.

**Schema needs** (DATA ARCHITECT)   **None.** Confirm: `posts.id` is `gen_random_uuid()` (v4, 122 random bits) and so meets NFR-SEC-006's
unguessable id; 404 on `GET /posts/:id` is identical for unknown and unreadable (F3.1 c12), so links add no enumeration path; no table, policy,
grant or cleanup change; no event table (4א).

**Critical external assumptions** (for DATA ARCHITECT and CRITIC; c7 rests on them)
- E1 Link-preview fetchers (WhatsApp, Meta, Telegram, iMessage, Gmail, Outlook) read only the static HTML Vercel serves for the URL; they run no JS,
  hold no Nestly session and cannot call `/api` with a token. Any future SSR, middleware or edge rendering of `/posts/*` re-opens c7.
- E2 Vercel serves `/posts/*` and `/` from static files through `vercel.json` rewrites (today one rewrite to `index.html`); a distinct post HTML needs
  a rewrite order that `/api/*` still wins. Preview deployments sit behind deployment protection, so crawlers see 401 there: the real preview is
  verified only in production (Afik's device check after merge, afik-list-1018 "F3.6").
- E3 WhatsApp and others cache a preview per URL; since every post URL serves the same tags, no cache can hold post content.
- E4 Opening a link inside the WhatsApp in-app browser has no session; Google refuses OAuth in embedded webviews (`disallowed_useragent`), so
  Google sign-in may fail there while email sign-in works. Accepted limitation, no special handling (Open).
- E5 `navigator.share`/Clipboard need a secure context (HTTPS, localhost); Firefox desktop lacks `navigator.share` → option hidden (c4).

**Open questions**
- Distinct post preview → **assumed** a second static HTML entry routed for `/posts/*`; if Vercel/Vite cannot serve it without SSR, the fallback is
  one generic preview "Nestly" for all paths (still satisfies BR-067; ORCHESTRATOR records the change).
- Return after registration → **assumed** out of scope: a new visitor registers and lands on the normal landing; reopening the link works.
- In-app browser Google sign-in (E4) → **assumed** accepted; recorded in `security-privacy-open.md` only if CRITIC rates it a privacy item.
- Link origin → **assumed** `window.location.origin` (production domain in production). No reserved point open here.

**Size estimate**  ~330 product lines (shared ~40, web ~250, HTML/routing ~30, server header ~10) + ~450 test lines. One PR, after F3.7 and F3.5.
**Split reason**  F3.5 + F3.6 = 24 criteria, above the Elevated cap of 20 (~850 product lines together), and the external surface differs in review.
**Gate 1 amendment (ORCHESTRATOR, 19.10, direction.md "דפוסי אינטראקציה"):** ShareSheet in F3.7's sheet primitive, closing and focus per c4.
