# result — F3.3w1 comments and likes on the post page (web)
**Done:** thread under the post (oldest first, "עוד תגובות"), names / "מהקהילה" / "המחבר", like on post and comments (reusable LikeButton, optimistic with rollback), comment and reply composers (one level), 3 inline replies + "הצגת עוד השבות", delete own comment (dialog), states; no controls without the posting right.
**Path:** Elevated · screen contract + 6 screen challenges (ORCHESTRATOR) · BUILDER ∥ TEST ENGINEER from screen.md · CRITIC opus round 1 (1 medium, 3 low) → fixed → round 2 clean. TEST ENGINEER started beside BUILDER: yes.
**SRS trace:** FR-FEED-003 (UI), FR-FEED-005 r.1 display, Afik 7א (comments stay visible). **Tests:** comments e2e 44/44; web unit 1101; test:product ~700:~1000.
