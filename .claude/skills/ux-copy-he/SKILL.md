---
name: ux-copy-he
description: Hebrew interface copy for Nestly — gender-neutral phrasing, error messages taken from the SRS ERR catalog, buttons, empty states and a tone fit for pregnancy and parenting. Use when writing or reviewing any user-visible text under apps/web.
user-invocable: false
paths:
  - "apps/web/**"
---

# ux-copy-he — what the user reads

**Version:** 1.0 · the binding rules are elsewhere and are not restated here:
- **Gender-neutral copy:** SRS NFR-USAB-003.
- **Error texts:** the SRS error catalog, §10.
- **Never show a raw error:** `.claude/knowledge/conventions.md`.

Layout, dates and numbers are in `rtl-hebrew`.

## Patterns

**Gender-neutral.** Use the impersonal form for messages, nouns or infinitives for actions, and the plural
imperative only when nothing else works.

| ✅ | ❌ |
|---|---|
| "אפשר לשתף עם Friends" | "את/ה יכול/ה לשתף" |
| "יש למלא תאריך" | "מלא/י תאריך" |
| button: "שמירה", "שליחה", "ביטול" | button: "שמור", "שמרי" |
| "לא נמצאו תוצאות. אפשר לנסות מילה אחרת" | "לא מצאת? נסה שוב" |

**Errors come from the catalog.** Each one says what happened, then what to do — never who is to blame, never a
technical detail.

```ts
// the server returns a code; the web app maps it to the ERR text
const messages: Record<ErrorCode, string> = { /* each entry traced to its ERR-xxx in SRS §10 */ };
```

**Empty states** say why the list is empty, and offer the next step.

**Tone:** calm, warm and direct. The audience includes people in pregnancy, after loss and in fertility
treatment:
- Never assume an outcome, a family shape or a stage.
- Never phrase anything as medical advice (BR-012, NFR-PRIV-006).

**Product terms** keep the names the SRS and the sketches use (SRS §1.4, Appendix A). A new user-visible term is
a decision for Afik, not a writing choice. Humour appears only where the SRS asks for it; its wording is Afik's
(OP-021).

## Forbidden

1. Slash gender forms ("את/ה", "י/")
2. Singular gendered imperatives in buttons or messages
3. Error text that is not traced to an ERR item, or a generic message
4. Internal codes, table names or stack traces in user text
5. Blame ("הזנת שגוי")
6. Medical or diagnostic wording
7. Assumptions about children, pregnancy outcome or family shape
8. An invented name for a product term
9. Text built by concatenating fragments, which breaks agreement and order in Hebrew

## Done when

- A grep of the diff finds no slash forms.
- Every error string cites its ERR ID or is the generic message.
- No new term was invented.

## Changelog
- 1.0 — 2026-10-11 — created after Afik decided on gender-neutral copy (NFR-USAB-003). Provisional until 5
  features.
