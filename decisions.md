# Decisions

Read **In force** before proposing an approach; read only the related full monthly entry for reasons
and rejected alternatives. The index routes to rules, not a second rulebook. Operational authority:
CLAUDE.md → Decision authority; sequence/gates/records: .claude/workflow.md.

Append Afik’s full decision to `decisions/<YYYY-MM>.md`; never edit/delete an earlier entry. Add or
update one index line naming what it supersedes/updates/extends. Move superseded navigation to the
archive. Keep this file within its byte budget. ORCHESTRATOR decisions belong in the part spec/result.

```
YYYY-MM-DD | <decision in one line>
  alternatives: <what else was considered>
  why:          <the reason>
  accepted cost: <what we knowingly give up>
  decided by:   <who>
  updates / supersedes / extends: <date and title>
```

## In force

09 = [September](decisions/2026-09.md); 10 = [October](decisions/2026-10.md). Dates/titles locate the full entries.
Grouped rows retain all current topics. Older wording yields to the named later decision and canonical file.

| Date / month | Topic and current source; archive entry titles |
|---|---|
| 09-12 / 09 | Roles/context: ORCHESTRATOR main loop, BUILDER subagent, six agents (extended by D2/design); CLAUDE routing, workflow Model assignment |
| 09-12 / 09 | Learning: two-way gate quality, budget/provisional trial, knowledge first; learning.md §§0–9 |
| 09-12 / 09 | Israel-only launch market; product requirements in SRS |
| 09-12, 10-11 / 09–10 | PostgreSQL/Supabase, RLS, Drizzle, user transaction, audit/protected reads; data-model Platform rules and exceptions |
| 10-10–11 / 10 | D1 SRS markdown, scope/version/export; workflow SRS maintenance. D5/D6 product decisions in SRS |
| 10-10–11 / 10 | D2 ALGORITHM & DATA; D3 AI readiness/recording; algorithm-data.md and ai-ml-readiness.md |
| 10-10 / 10 | External engineering guidelines A1–A9 adopted; coordination layer rejected |
| 10-10–11 / 10 | QA tooling; TypeScript Rule 0; own Fastify server, npm workspaces, Zod, Vite stays, portable Web-first; CLAUDE Stack/conventions |
| 10-11 / 10 | Supabase Auth, Data API off, Storage TBD; Hosting Vercel fra1/Supabase Frankfurt, polling; data-model/conventions |
| 10-11 / 10 | JWT jose/JWKS; app_owner grants and single auth.users anchor; migration role/CI/session pooler, environment names; data-model Platform rules |
| 10-11 / 10 | GitHub remote public afikyermi/Nestly; repository layout/naming; conventions |
| 10-11 / 10 | UI: design track, visual direction/R1/R2, approved libraries, design consistency, bottom navigation יועצים, tracker אמבטיה; docs/design and design-system skill |
| 10-11–12 / 10 | UI wave 1 Gate/addenda a–f; shared components, pending Button, focus/layout/props; full entries and approved artifacts |
| 10-11 / 10 | Product sketch decisions, sharing, D7 roadmap; later order 10-17 supersedes sequencing; SRS/WORKPLAN |
| 10-11, 10-13, 10-16 / 10 | Working rules, Elevated path, three older texts yield: delegated unreserved decisions/gates; CLAUDE Decision authority, workflow Gates |
| 10-12–13 / 10 | Green GitHub CI, commits/pushes/squash, traceability; workflow Closing a part / Records and commits / Traceability |
| 10-12, 10-14 / 10 | Vercel main/open-PR builds, preview access and bypass-header fence; existing deployment tools/workflows |
| 10-13–16 / 10 | Agent-slim/guard stages, F5 rotation, settings ask narrowing, accepted effortful bypass; later Guard simplified preserves secret/prod/env/force-push protections; learning §0 and existing guard |
| 10-13, 10-16 / 10 | Round limit and audit decisions 4: one fix/re-check after blocking bug; workflow Verdicts. Audit freeze replaces I1/F1.8 freezes |
| 10-13 / 10 | F1.1 Gate 2 conventions, I1 points (RESTRICT, journeys, children, age, names); data-model and SRS |
| 10-14 / 10 | F1.2 Gate 1, Node floor, named source-scan exception; F1.3 Gate/revised spec/error text; full feature entries |
| 10-14 / 10 | F1.4 Gates/amendment, column INSERT grants, direct web Auth, taken-email/password rule, transaction 503; data-model/SRS |
| 10-15 / 10 | F1.4 Auth error/retry handling and held-token fields; F1.5 Gate/session/registration completion/terms/privacy/platform fence; full entries |
| 10-14–16 / 10 | Pace/speed-up A–F and CRITIC round, tests by criterion, one layer, browser matrix and visual tolerance; later Audit 1–6/8/12 and P2 supersede caps/interface/CI ordering; workflow Test rules |
| 10-14–17 / 10 | Waiting on Afik, standing autonomy/baselines, audit batching (cadence superseded 10-18 P6)/parallel sessions; workflow Waiting on Afik. Production pre-launch delegation remains only in Batched approvals |
| 10-15 / 10 | Lecturer presentation plan v2/answers: finish product, demo via product, normal login; supersedes presentation tooling/split |
| 10-15–16 / 10 | F1.6 recovery, Gate 1/Gate 2/amendments/wrap-up; recovery key rejected; data-model exceptions/SRS; later lock ladder below |
| 10-16–17 / 10 | Automated E, DR-E1 test-user cleanup, part 2 trusted-main cleanup/50 cap; later per-run limit and table-update obligation; data-model exceptions and cleanup tools |
| 10-16 / 10 | Before I3–I5 decisions/defaults/placement/OP-031–034: deletion grace, community/reports/ladder/media/Stories/hotline; SRS |
| 10-16 / 10 | I2 questionnaire, F2.0 AR-1/AR-2, accepted guard risks S-62/S-63; full entries and data-model exceptions; secrets stay with Afik |
| 10-17 / 10 | F1.8: guard-freeze flow-file exception; DR-2/3; Rule L not built, DR-5 metadata; full first-Google registration/password; security-privacy-open and SRS |
| 10-17 / 10 | I2 reserved points: hard delete, ages, DR-G1 profile_view, Friend/Open view, rate limit, terms, gateway key; F2.4c1 DR-L own counters/audit cleanup; data-model |
| 10-17 / 10 | Initiative order: I3 waits for approved system fixes; I9 after I14, then demo/launch, I15 later; WORKPLAN |
| 10-17 / 10 | Retention + Conversations after deletion: 90-day security/audit exception and intact conversation for other party; privacy wording/OP-036; SRS |
| 10-17 / 10 | Gateway token call accepted debt; recovery lock ladder and accepted DoS; domain/email/Pro before launch; SRS/debt/WORKPLAN |
| 10-17 / 10 | Browser versions and PERF/LOAD/AVAIL delegated; Sentry/Turnstile setup and I9 wiring limits; SRS/WORKPLAN |
| 10-17 / 10 | P1 + Waiting has a ceiling (אישור אפיק 17.10): workflow Closing a part; tools/part-status; retained by P2 |
| 10-17 / 10 | P2 — short consistent contracts (אישור אפיק 17.10): canonical rules, indexed reads, archived history, new-artifact line/byte budgets; full entry below in October |
| 10-18 / 10 | P6 schema before code: migrate right after the schema PR, before its code; supersedes 10-16 audit item 2 batching; workflow Batched approvals |
| 10-18 / 10 | Branch auto-delete; only main and ready/** deploy (vercel.json, P4); workflow Stable candidate |
| 10-18 / 10 | Unstable tests: no real-clock limits, all concurrency outcomes, 10× before PR, fix or quarantine; workflow Test rules, TEST ENGINEER 2.3 |
| 10-18 / 10 | After the audit: budgets 40,000/9,000 · CRITIC returns text (saved verbatim; CRITIC 1.9) · guard retro and merged/ready remote delete · password fix, P1.1 before I3; records split, P5, P7 before I3 ∥ I6 · local test:db |
| 10-18 / 10 | I3 questionnaire 1א–8א: audience everyone (remembered), share only everyone posts, deletion/report hold, no I3 events, author stage tag, anonymous=everyone, reporter-only hide, F3.9 hide-post; I3-questions.md |
| 10-18 / 10 | Project reserved points (afik-list-1018): I4 user block, child reports top; I6 period charts; no pro verification; demo coupons; ANALYTICS_VIEW per-user no names; admin charts in demo; roadmap Amendment 6 |
| 10-18 / 10 | F3.0–F3.2 answers: reported comment/user visible; Restricted ≠ posts; expired report kept; S-34/S-35; 6ב full author names |
| 10-18 / 10 | Screen contract: screen.md annex of spec |
| 10-19 / 10 | PR cadence: schema first, 1 PR/feature, split >900 lines or 12/20 criteria · Q7 B · Q8 keep · UX patterns (direction.md) |

## Superseded and historical navigation

The complete pre-P2 index, including every feature decision, superseded row and closed Pending item,
is preserved in [archive/decisions-index-pre-p2-2026-10.md](archive/decisions-index-pre-p2-2026-10.md).
Use it only to locate history, never as a current instruction. Full entries remain in the month files.
Agent changelogs: October → **P2 — archived agent changelogs**. P2 resolves old reader/CI/interface/
manual-Preview/approval/cap wording; original entries remain unchanged.

## Pending — not yet decided

Design review: the Reaction name at R2. Palette/font/layout/eighth tracker tile were decided 10-11.
Open product points: SRS appendix-b-open-points (OP IDs), TBD/נדרש אישור in relevant sections.
Recheck current status there; no default silently settles a reserved point.
