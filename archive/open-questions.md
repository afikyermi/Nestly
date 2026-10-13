# Open questions

What is still undecided, what each one blocks, and what changes in the system depending on the answer.

Not a list of TBDs — the SRS already has one. This says **what it costs to answer late.**

---

## Already decided

| Decision | Answer |
|---|---|
| Language, UI, markup | **React · JavaScript · JSX** — 🔒 iron rule |
| Styling | **Tailwind** |
| Database | **PostgreSQL via Supabase.** One source of truth |
| Authorization | **RLS, enforced in the database** |
| Tests | JavaScript · Playwright for e2e · SQL for database. In the repo |
| CI + PreToolUse hook | approved — **not yet built** |
| Primary market at launch | Israel only |
| CRITIC and TEST ENGINEER | separate |
| Agent roster | 6 + ORCHESTRATOR as the main loop |
| Gate 2 | scoped to schema / irreversible / external provider |
| As-built | the repo, plus `data-model.md` and `conventions.md` |

Reasoning for each: `decisions.md`.

**Section A is closed.** The agent infrastructure is no longer blocked by anything.

---

## A. Open, and worth deciding soon

### A1. Type checking via JSDoc

The iron rule removes compile-time checking, which was the cheapest defence against an agent
inventing a function, field or property. Typed comments in plain `.js` files plus a `jsconfig.json`
recover much of it — no `.ts` files, no compiled output, the shipped code is exactly what was written.

The honest caveat: the checker is the TypeScript compiler in check-only mode. Whether that violates
the spirit of the rule is Afik's call.

Not blocking. But every week without it is a week of escapes that a compiler would have prevented.

---

### A2. What the LLM/ML is for — NEW, and now the highest-leverage product answer

Afik confirmed the system will include LLM/ML. This reverses the earlier "correctly deferred" status
and makes it a live gap — and not only a missing agent.

**It breaks three things the model is built on:**

1. **SPEC's core rule** — "a criterion a test cannot assert is not a criterion." An LLM feature cannot
   be asserted by a single test. It needs a second form of criterion: **a threshold on an eval set**
   (e.g. recall ≥ 0.9 over 200 labelled examples). SPEC cannot currently produce that.
2. **TEST ENGINEER's model** — it writes pass/fail tests. A probabilistic feature gets a score over a
   distribution, not a verdict. Different operation.
3. **Binary CI** — an eval returns a number. The gate becomes a threshold, and thresholds drift.
   Someone must own what passes.

**And two risks become live:** prompt injection, once user-generated content reaches a model's context
(observed in the wild against moderation systems, and this product *is* UGC); and per-user inference
cost, which nothing currently owns at a zero budget.

**The Agent Necessity Test passes cleanly** — the first new agent that does. Decisive argument: whoever
wrote the prompt is the worst judge of whether it works, exactly the CRITIC-vs-BUILDER argument.
BUILDER can make a model run; it cannot say whether the output is good enough. CRITIC reads diffs and
cannot evaluate model quality either. **Right now nobody in the roster can answer "is this AI output
acceptable."** Not a Domain and not an extension of an existing agent, because the eval set is a
maintained asset with its own context — and Domains do not own assets.

**What the SRS must say: what the model is used for.** The risk differs by orders of magnitude:

| Use | Risk | What the eval measures |
|---|---|---|
| Feed ranking · semantic search | low | relevance, retrieval accuracy |
| Professional matching | medium | match quality — a wrong match has consequences |
| Automated moderation | high | a miss causes harm; a false positive silences a person |
| **Generating health-adjacent text** | **highest** | — |

The last one needs stating plainly: a model that answers questions or summarizes advice **in a
pregnancy community** can produce harmful misinformation — wrong infant sleep guidance, wrong
information about a medication in pregnancy. That is a different category of risk from ranking a feed,
and the answer to "which agent, with what authority" depends on it.

---

## B. Belongs in the SRS — blocks the data model

Ordered by what it costs to answer late.

### B1. Anonymity — the most expensive question in the product

**Can a user post without their identity attached?**

This forks the identity model:

| Answer | Model |
|---|---|
| never | one identity. simple |
| yes | **stable internal identity** + **separable display identity per content item** |

**Cost of deferring:** the highest of anything on this list. Retrofitting means splitting identity
across every piece of content that already exists, and re-deciding the author of each one.

**The product tension, which is why it is not merely technical:**

| needs anonymity | needs identity |
|---|---|
| pregnancy loss · fertility struggles · postpartum depression · questions about one's own body | trust in a professional · effective moderation · organic reputation · Give Back, which is built on reputation |

These are the strongest emotional drivers in your audience and they require opposite things.

**My position:** build the split identity model even if anonymity stays switched off at launch.
The model costs little now. Retrofitting it costs more than any other change in this document.

### B2. Who can see community content

| Answer | Consequence |
|---|---|
| every signed-in member | one simple policy. reviewable. helps cold-start density |
| scoped by group or connection | requires memberships and connections tables from day one; **every read becomes a graph query**, and every policy a join |
| visible without signing in | pregnancy, fertility and baby content in a search index, permanently. invites scraping and profile harvesting |

Blocks: the shape of every authorization policy.

### B3. My Stage — how it is segmented, and the entry and exit points

Three questions, one model: the entry point (planning / pregnancy / birth), the maximum child age,
and how the range is divided.

**The technical point worth deciding deliberately:**

> **Stage is almost certainly a derived value, not a stored one.** Store a due date or a birth date
> and compute the stage. Then a user advances through stages with no write at all, and no scheduled
> job that can fail silently.

If instead you store the stage as a field, something must advance it on a schedule — for every user,
forever. That job will fail quietly one day and nobody will notice for a week.

What the segmentation count determines: the cold-start density threshold. More stages means a better
fit per user and a higher number of users required before any single stage feels alive.

### B4. Are both parents treated identically

If a partner also has an account, their stage derives from the pregnant person's pregnancy.
That is a **relationship in the data model**, not a copied field — and if it is a copy it will drift.

Blocks: whether a profile can be linked to another profile, and what that link means.

### B5. Professional verification

`דרך אימות ההסמכה — TBD` in the SRS. This is load-bearing.

The three professions named in the SRS sit at three different levels of regulation — one has an
internationally recognized certification that can be checked, one has varied training, and one is
essentially unregulated. The mechanism has to handle all three.

Implies, if verification exists: document upload and storage · a review queue · a verification state
machine · a visible verified/unverified distinction.

Blocks: whether the Services area can exist at all.

### B6. Moderation model

Blocks: report and flag tables, a queue, enforcement actions, appeal state — and whether any of it
ships at launch. A user-generated-content platform without a moderation path is not launchable.

### B7. Preliminary Conversation — realtime or asynchronous

| Answer | Cost |
|---|---|
| asynchronous, with notification | rows in a table. nothing new |
| realtime | live subscriptions, typing and read state. available on Postgres without a second database, but it is real work |

My read: asynchronous is entirely sufficient for checking fit between a parent and a consultant.
Nobody expects a professional to answer within seconds.

### B8. Feed — chronological or ranked

| Answer | Consequence |
|---|---|
| chronological + stage filter | one query, one index. explainable to a user and debuggable by you |
| ranked by rules | DATA ARCHITECT decides what is stored vs computed; the score must be reproducible |
| ranked with learning | activates AI/ML as a real agent, and requires behavioural data you do not have |

At a thousand users ranking adds nothing — there is not enough content to rank.

### B9. Money — Booking Commitment and Lead pricing

Amount, cancellation terms, refunds, whether it offsets the service price, Lead price and whether it
varies by service type.

Blocks: payment integration, which is the heaviest single feature in the product. Everything about
it is a risk flag.

### B10. Brands — platform users, or business-side only

Blocks: whether a third account type exists.

### B11. Name

`שם המערכת — TBD` in the SRS, while section 1.1 says Nestly.

**Check the Nestlé conflict before spending anything on branding.** Same commercial space —
infant formula and baby food — and the mark is defended aggressively.

---

## C. Open, mine to ask, not blocking

- **First initiative.** Assumed to be accounts + profile + stage, since everything depends on it.
  Not confirmed.
- **Light path threshold** — currently ~30 lines in `CLAUDE.md`. A calibration guess; `noise.md`
  will tell us if process is being applied where it was not earned.

---

## Order that unblocks the most

1. **A1 + A2** — Postgres and the enforcement layer. No SRS dependency. Unblocks CI, the hook, and
   all agent infrastructure.
2. **B1** — anonymity. Most expensive to defer. Decide the *model* even if the *feature* waits.
3. **B2 + B3** — visibility and stage. Together these determine nearly every table.
4. **C** — first initiative. Then the loop can run on something real.
5. Everything else can follow the features that need it.
