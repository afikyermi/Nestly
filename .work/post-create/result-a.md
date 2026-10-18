# result — F3.1a post-create (server)
**Done:** shared Zod (createPostSchema/updatePostSchema, POST_BODY_MAX 2000 code points, NUL refused), `/api/posts` POST and `/api/posts/:id` GET/PATCH/DELETE → service → repository in the identity transaction; delete via delete_post (held → same 204); pg errors mapped to fixed codes.
**Path:** Elevated · SPEC → Gate 1 → BUILDER ∥ TEST ENGINEER → CRITIC opus (0 crit/high/med, 1 low fixed). Body-length CHECK shipped in F3.0b (#76).
**SRS trace:** FR-FEED-002 (text), OP-033, BR-062/VAL-036 (refusal of isAnonymous), Afik 1א, 3א, 5א, 5 (edit of a reported post allowed); new post-length VAL → I3-close /srs-update.
**Local evidence:** server db suite 664 pass · shared 382 pass · tsc/eslint clean · race tests 10× via repeats (per-run exclusivity).
**CI:** pending at candidate push. **Next:** F3.1b (web composer, own-post page).
