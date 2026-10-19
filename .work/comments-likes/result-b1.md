# result — F3.3b1 comments server
**Done:** POST/GET /api/posts/:id/comments (create, reply one level, thread oldest first, 20 top-level per page, first 3 replies inline + replyCount), GET /api/comments/:id/replies (20/page), DELETE /api/comments/:id (own, held → same 204); "המחבר" byAuthor without the anonymous id; names via regular_names RLS; isMine under A&D's conditions.
**Path:** Elevated · BUILDER ∥ TEST ENGINEER · CRITIC opus round 1 (1 medium: unbounded replies → ORCHESTRATOR decision, 3 low) → fixed → round 2 clean; A&D allow-list for isMine.
**SRS trace:** FR-FEED-003, FR-FEED-005 r.1, BR-062, AC-076, Afik 3א/7א (comments)/6ב; comment VAL 1000 (F3.3a). **Tests:** server db 735; comments 33 + 10× concurrency; test:product 857:617.
