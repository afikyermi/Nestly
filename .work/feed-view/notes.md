# notes — feed-view a1 (pure ranking core, packages/shared/src/feed)

**Approach**        config.ts (Zod + `resolveFeedConfig`), cursor.ts, score.ts (scorer, `rankTier`, `compareRankKeys`), rerank.ts (`rerank`, `selectFeedPage`),
response.ts (strict unit union + page envelope). All pure, no DOM/Node API (own base64url, no btoa/atob). Exported from the package index.
**Decisions**
- Config input is `{version,isActive,values:unknown}[]` + pinned version|null; output `{config,configVersion,restarted,fallback:{configVersion,errorClass}|null}`.
  errorClass: no_active, invalid_active, none_valid, pinned_missing, pinned_invalid. If the chain fell back too, its class wins; `restarted` shows the pin failure.
  Pinned 0 is always valid. Rows with version <= 0 or non-integer are invalid. v0 keeps halfLife 24, qualityCap 20, window 14 (v1 defaults).
- Cursor keys camelCase: asOf, configVersion, tier, score, createdAt, id. Timestamp check is calendar-aware by arithmetic, no Date. Client text = base64url(JSON);
  `parseFeedCursor` returns null for anything invalid (route: 400 cursor_invalid) and lowercases the id.
- `selectFeedPage(ranked, config)`: ranked = pageSize+1 fetch. Page = first pageSize units, the extra one only signals "more". `cursorFrom` = last of those
  pageSize in ranked order, suppressed included (c9); null when no extra. Taking the (pageSize+1)th as cursor would skip it, so not done.
- Re-rank window check looks only at the trailing diversityWindow-1 placed units (earlier windows were judged when filled). Anonymous = flag only; its
  authorId is never read. Creator cap applies to named units only.
- Scorer: `Math.log(1+n)` and `Math.pow(2, -age/halfLife)`, left-to-right sum, to mirror the SQL float8 expression. Friend term is 0 when isAnonymous.
- Response: `restarted` optional boolean; share `body` and `sharerText` nullable (a share may carry no text); post `body` string; unit createdAt = z.iso.datetime().
  Original: three strict variants (named with author, anonymous without author key, unavailable).
**Deviations**      none.
**Deliberately not done**   ANONYMOUS_AUTHOR_LABEL (part b, c16); any server, SQL or web code; tests (TEST ENGINEER).
**Uncertain**       share `body` nullability and whether `sharerText` duplicates `body` for shares: spec literal ("shares add sharerText") followed; a2 maps one source to both.
**Evidence**        packages/shared typecheck, eslint, vitest (369 pass incl. tests/feed-ranking.test.ts), check-budgets ok.
**Neighbouring**    none.
