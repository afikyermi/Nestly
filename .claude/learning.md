# Learning & Evals

**Version:** 1.0
**Owner of the procedure:** ORCHESTRATOR prepares. **Afik approves.** No agent amends itself.

This file closes the loop. Without it, `escapes.md` and `noise.md` are data nobody reads.

---

## 1. What learning means here — and what it does not

Agents do not learn. Weights are frozen; a subagent holds no memory between invocations. Anything
that looks like an agent improving is one of two things:

| Level | Mechanism | Cadence | Where the value is |
|---|---|---|---|
| **Externalized memory** | agents read `conventions.md`, `data-model.md`, `decisions.md` | **weekly** | 🟢 **most of it** |
| **Definition improvement** | the agent's `.md` is edited | 5–10 times in 6 months | 🟡 real but rare |
| Fine-tuning | — | never | ❌ kills traceability. not used |

> **The highest-value learning is not the agents getting smarter. It is the knowledge files getting better.**

An agent definition is a general professional method — already near its useful ceiling. A knowledge
file is a specific fact about *this* codebase — and that is what the agent is actually missing.

**Expect the knowledge files to change constantly and the definitions to change rarely.** If you find
yourself tuning definitions every week, something is wrong: usually a knowledge gap being
misdiagnosed as a method gap.

---

## 2. The two instruments

A gate can fail in two directions. Measuring only one produces a system that gets stricter forever.

| Instrument | Measures | Written when | By |
|---|---|---|---|
| `escapes.md` | **misses** — what got through | a defect is found after merge | ORCHESTRATOR |
| `noise.md` | **false positives** — what was raised and wasn't real | Afik dismisses a finding, or a finding cost more than it saved | ORCHESTRATOR |

**Both are required.** A CRITIC that raises ten findings of which nine are dismissed is expensive
noise, and without `noise.md` that failure is invisible — it even looks like diligence.

---

## 3. Trigger

Run a retro at **whichever comes first**:

- **10 merged features**, or
- **any `critical` escape** — immediately, and scoped to that one category, or
- **6 weeks** — a backstop so low velocity does not mean no review

No other trigger. A retro after a single bad day produces a rule that outlives the bad day.

---

## 4. Procedure

1. ORCHESTRATOR reads `escapes.md`, `noise.md`, `debt.md`, and planned-vs-actual from every `result.md`.
2. It counts patterns. **A pattern is three or more occurrences of the same category.**
3. For each pattern, it writes one improvement proposal (§5).
4. Afik approves, modifies, or rejects each one.
5. Approved changes are applied — which triggers the `ask` prompt on `.claude/**`, by design.
6. Version bumped, changelog line added (§7).
7. Each change is marked **provisional** for the next 5 features (§8).

**The proposal must cite the log lines it rests on.** ORCHESTRATOR proposes from evidence, never from
its own opinion of how a specialist ought to work. It selects and sequences; it does not know
CRITIC's trade better than CRITIC does.

### The default is no change

Most retros should change nothing. A retro that concludes *"no pattern reached three; no change
earned"* is a successful retro, not a wasted one.

The ritual where a review must produce action items is exactly how a checklist grows into a
ceremony that catches nothing.

---

## 5. Improvement proposal format

```markdown
## Proposal <N> — <one line>

**Evidence**      escapes.md: 2026-10-02, 2026-10-14, 2026-11-01  (3 occurrences)
**Pattern**       what keeps happening, stated as a category not an anecdote
**Diagnosis**     knowledge gap · method gap · missing gate · wrong path selection · unforeseeable
**Change**        the exact edit, in the exact file
**Budget impact** adds N to <agent>'s required checks. currently X of Y → over budget? what is removed
**Expected**      what should stop appearing in escapes.md if this works
**If it fails**   how we will know, and what gets reverted
```

### Diagnosis first — it decides where the fix goes

| Diagnosis | Fix goes in | Not in |
|---|---|---|
| the agent did not know a fact about this codebase | `knowledge/` | the definition |
| the agent applied a sound method and still missed it | the definition's required checks | knowledge |
| nothing was looking at all | `workflow.md` — a trigger or a path | any agent |
| the work took the wrong path | `CLAUDE.md` path conditions | any agent |
| genuinely novel | **nothing.** log it and move on | anywhere |

**Most escapes are knowledge gaps misread as method gaps.** Check `knowledge/` before touching a definition.

---

## 6. Required-checks budget

A checklist that only grows becomes a ritual. Each agent has a cap.

| Agent | Budget | Current (v1.0) |
|---|---|---|
| SPEC | 8 | 6 |
| DATA ARCHITECT | 12 | 9 |
| BUILDER | 12 | 9 |
| SCOUT | 6 | 5 |
| CRITIC | 20 | ~16 |
| TEST ENGINEER | 10 categories | 6 |

> **At budget, adding a check requires removing or merging one.**

This is the forcing function. It makes the retro rank checks by actual escape data instead of
accumulating every good idea anyone ever had. An over-budget proposal must name what it displaces.

Budgets are an initial calibration. They are themselves revisable — but only with evidence that the
cap, not the content, is the problem.

---

## 7. Versioning

| Change | Bump |
|---|---|
| a check added, removed or reworded · an output field changed | patch — `1.0 → 1.1` |
| role boundary · decision rights · escalation · a principle | major — `1.x → 2.0` |

On the first amendment, add to the bottom of the file:

```markdown
## Changelog
- 1.1 — 2026-11-02 — added check: <what>. removed: <what>. evidence: escapes 3×. (provisional until 5 features)
```

One line per change. It must name the evidence. A change without evidence in the log is an opinion,
and opinions are how this model drifts back into the 11-agent version of itself.

---

## 8. Provisional changes and the anti-stacking rule

Every approved change is **provisional for 5 features.**

| Outcome after 5 features | Action |
|---|---|
| the category stopped appearing in `escapes.md` | the change is confirmed. drop the provisional mark |
| the category appeared again | **the change did not work. revert it and try a different one.** |
| `noise.md` grew in that category | the change over-corrected. revert or narrow it |

> ## Never stack a second rule on top of a failed first rule.
> This is the single most important rule in this file.

Stacking is how a 16-item checklist becomes 200 items, none of which anyone believes. If a check
did not prevent a recurrence, the check was wrong — not insufficient. Remove it before adding another.

**Honest limit:** at solo velocity there is no statistical power here. Five features is not a sample,
it is a sanity check. Treat these conclusions as weak evidence and prefer reverting a change over
defending it.

---

## 9. What may never change this way

Not subject to the retro loop. Only Afik, deliberately, outside it:

- an agent's role or its authority
- decision rights and escalation paths
- the permission model or anything in `settings.json`
- the three rules that make the reviews real — CRITIC not reading `notes.md`, TEST ENGINEER not
  reading the diff, acceptance criteria being assertable
- the human gates
- this file

An agent may **file a note** observing a gap in its own definition. It may never write the edit.
`settings.json` enforces that: `Write`/`Edit` on `.claude/**` prompts Afik.

---

## 10. What a retro produces

One of exactly these, and the first is the most common:

1. **No change.** No pattern reached three.
2. **A knowledge entry** — the usual outcome when something is missed.
3. **A definition patch** — within budget, with evidence, provisional.
4. **A workflow change** — a new trigger or a path-condition change.
5. **A structural proposal** — merge two agents, split one, add one. Requires the Agent Necessity
   Test, in writing, and Afik's approval. Expect this at most once or twice ever.

If a retro ever proposes more than two changes at once, something is wrong with the retro, not with
the model. Pick the one with the strongest evidence and run it alone — otherwise you cannot tell
which change did what.
