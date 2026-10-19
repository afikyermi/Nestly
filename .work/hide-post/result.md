# result — F3.8 medical-hotlines + F3.9 hide-post (one PR)
**Done:** /medical-hotlines (MDA 101 + four HMO lines verified on official sites 19.10, Meuhedet DR-1 fallback), menu item; one "⋯" card menu (own: edit/delete, share: delete only; others + own anonymous: hide), hide/undo stored on the server (not a ranking signal), Back/Esc/outside close, non-modal menu.
**Execution:** Succeeded · **Quality:** Good (2 low A–B → polish 5b; B later fixed in F3.7). **Path:** Elevated · BUILDER ∥ TE (worktree) · TE 3 findings fixed · CRITIC opus 2 medium + 2 low → fixed (fresh re-check, fix >60 lines) · rebase hunk checked.
**SRS trace:** FR-MENU-002, AC-109, FR-ALG-009 (hide subset), P-ALG-06; SRS-changes rows 5, 7.
**Evidence (local, 1a4153d):** unit shared 459 / server 868 / web 1149; db 799 pass; e2e hide-post + hotlines + anonymous + posts 86/87 (1 load flake, passes alone). Baselines for new screens: Linux workflow after the candidate push.
**Timing:** BUILDER 65 min (incl. numbers) · TE 50 min · CRITIC 4 + re-check 4 · fix rounds ~70 min · CI/E: see PR.
