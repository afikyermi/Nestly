# notes — feed-composer (amended: always-open field)

**Approach**  `FeedComposer.tsx` renders the F3.1b/F3.4 form in one fixed place in `FeedScreen` (after the status, before list/empty
state), never remounted by feed phase. `PostForm` gets `compact` (idle = text + "פרסום"); the Composer shows the options while focus is in
the form (or a press is in progress), text is non-blank, or a failure/body error shows. A success bumps a key: new empty, idle composition.
`compose-draft.ts`: in-memory draft per token user id, `beforeunload` guard (non-blank text), one-shot "focus the text" request from
`/posts/new` (`NewPostRedirect`, history replace). `post-unit.ts` + `addPublished` put the new card first (de-duplicated by id).
`usePostingProfile` returns right + full name. RouteGuard calls `forgetDraft()` on sign-out.
Removed: button, "ביטול", Esc, ComposeScreen/WritePostButton/ComposePostPage, post-page "הפוסט פורסם", UNAVAILABLE_ACTION_TEXT, emptyAction.

**Decisions**
- Request to focus the text is module memory, not router state (state survives reload; c11 wants idle).
- Options stay during a pointer press inside the form: a press on an option blurs the text with no related target. After the press, if
  focus is outside the form the options hide again (blank text only).
- Publishing before the first page: the card is added above the list (c7); the first page then replaces the list (c9). Focus falls back
  to the heading when no card exists.
- Status priority: like failure, next-page announcement, "הפוסט פורסם", "הפוסט נמחק". Reveal is an instant swap (no animation).

**Deviations**  The empty state no longer holds the composer: it is a sibling above it (spec: form above, no action of its own).

**Deliberately not done**  No FeedComposer story (needs session providers); `PostForm` has an `Idle` story.

**Uncertain**
- Safari-style click that does not focus a button would hide options after a press on blank text (Chrome/Edge are the targets).
- `requestComposer()` runs in render of `NewPostRedirect` (idempotent); `takeComposerRequest()` in a useState initializer, like `takeStatus`.

**Evidence**  eslint, tsc, check:stories clean; posts-composer unit 28/28; e2e feed-composer:181 and anonymous-post:67 pass.

**Neighbouring**  Some registration/login unit tests hit 5 s timeouts under load (unrelated).
