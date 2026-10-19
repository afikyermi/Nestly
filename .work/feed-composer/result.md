# result — feed-composer (I3, deviation fix per direction.md; Afik item 15)
**Done:** composer field always open at the top of /feed (no button), options revealed in place on focus/text, published post first at once, draft kept per user across in-app navigation, module-level sending (no duplicates), /posts/new → /feed with focus. Separate compose page removed.
**Execution:** Succeeded · **Quality:** Good (1 low → debt). **Path:** Standard (web only) · redesigned mid-part on Afik's item 15 · CRITIC sonnet ×2 rounds (lows fixed) + rebase-conflict review on F3.9.
**SRS trace:** FR-FEED-002 (placement per direction.md); SRS-changes rows 6, 6b, 6c.
**Evidence (local, f4b20e1):** feed + hide-post + feed-composer e2e 101/101 (Chrome); composer unit 28/28. Baselines for idle/engaged/published composer: Linux workflow after the candidate push.
**Stacked:** on F3.9's final commit 34104a6 (PR #94) — merges on its own green CI + E per the stacked rule.
