# AI/ML readiness — dormant role, ready to start

**Status:** dormant (decision D3, 10.10.2026). **No agent file exists, on purpose.** SRS v1 has no ML or
LLM component (P-ALG-01, NFR-ALG-001, BR-049). An agent with no work tends to push AI where it is not
needed.

This file exists so that when Afik approves an AI use case, the agent can be created and start work
immediately — from the SRS, not from scratch.

---

## The rule that keeps the future agent ready

> **Every AI/ML idea or decision is recorded in the relevant place in the SRS.**

| State of the idea | Where it goes |
|---|---|
| a future option, not decided | `docs/srs/appendix-d-ai-ml.md` — a row with the option and what must be decided |
| decided for the product | the relevant FR, `docs/srs/18-algorithms-spec.md`, or an NFR — following the document's logic |
| a rule about AI governance | the relevant BR or NFR, plus `docs/srs/03-roles-permissions.md` when it concerns permissions |

ORCHESTRATOR routes any AI idea that comes up in work to one of these places. **Never** park one in a
chat or in `.work/` only.

---

## Entry conditions — when the agent is created

All of these are required. They come from SRS Appendix D.

1. **Afik approves** a concrete AI/ML use case — not "add AI", a specific capability.
2. The use case passes Appendix D's gate: **use case · data · value · safety · cost · fallback**.
3. **Model governance** is defined: provider, model and version, evaluation (offline and online),
   red-team, latency, cost, rollback.
4. The use case is recorded in the SRS as a decided requirement, not only in Appendix D.
5. The Agent Necessity Test is run in writing and recorded in `decisions.md`.

When all five hold, the agent definition is written as `.claude/agents/ai-ml.md` — generic, per rule 3.

---

## Map of AI-relevant places in the SRS

The future agent starts here.

| Where | What it says that matters for AI |
|---|---|
| `appendix-d-ai-ml.md` | every future AI/ML option — assistant, learned ranking, semantic search, auto-classification, collaborative filtering, moderation ML, churn prediction, experimentation, ads — each with its decision gate |
| `18-algorithms-spec.md` | v1 principles P-ALG-01..08, ranking pipeline, algorithm catalog ALG-01..09, evaluation principles §18.8 — the rule-based baseline any model must beat and fall back to |
| `05-functional/algorithms-data.md` | FR-ALG-001..010, FR-DATA-001 — the v1 behaviour |
| `06-non-functional.md` | NFR-ALG-001..003 (no ML in v1; safety; organic vs paid), NFR-OBS-001 (versioned events), **NFR-PRIV-006 (no medical diagnosis or inference)** |
| `08-business-rules.md` | BR-049 (ML/LLM only after a separate decision and evaluation), BR-060 (ML highlights need an SRS update) |
| `10-errors-edge-cases.md` | ERR-030 (missing configuration never switches automatically to an AI model) |
| `03-roles-permissions.md` | `ALGORITHM_AI_CONFIG` — changing algorithm or AI configuration is Admin Only |
| `13-data.md` | §13.2 data usage matrix — purpose limits bind any model; §13.3 event taxonomy — the measurement data |
| `04-architecture.md` | ContentMetadataFeature — semantic classification and embeddings are marked future |
| `16-future-out-of-scope.md` | AI/LLM, learned ranking, semantic search rows |

**The safety constraint that matters most for this product:** NFR-PRIV-006 and BR-012. The platform
never diagnoses, predicts illness or gives personalised medical advice. Any assistant, Q&A or summary
capability in a pregnancy and parenting community has to be designed around that first.

---

## Relationship to existing agents

| Agent | Keeps owning |
|---|---|
| ALGORITHM & DATA | purpose limits, the rule-based baseline and its fallback, evaluation measures |
| DATA ARCHITECT | schema and access control for any model inputs and outputs |
| the future AI/ML agent | model behaviour, model evaluation, model governance, model safety |
