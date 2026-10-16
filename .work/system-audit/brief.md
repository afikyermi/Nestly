# תדריך לבדיקה המקיפה של מערכת Nestly — לפני I2

## הקשר

אפיק ביקש (16.10.2026) בדיקה מעמיקה של כל המערכת מתחילת הפרויקט ועד היום, ואחריה תוכנית מיטוב לכל ההמשך
(I2–I14, תוכן הדמו, Expo). בדיקה בלבד, בלי לשנות דבר, על ידי סוכן שלא בנה את שיטת העבודה. התוצר: דוח ממצאים
מגובה בנתונים ותוכנית מיטוב מדורגת. שום שינוי לא מבוצע לפני אישורו.

**הכרעה שהתקבלה בסשן הזה:** הבדיקה תרוץ **במחשב של אפיק**, בסשן מקומי, כי תמלילי הסשנים
(`~/.claude/projects/<Nestly>/*.jsonl`) ויומן החסימות המקומי של ה-guard (`.claude/logs/blocks.jsonl`) קיימים רק שם, והם
המקור היחיד למדידה מדויקת של קריאות, מודלים, טוקנים וזמני המתנה.

**לכן התוצר של הסשן הזה (בענן) הוא התדריך הזה:** מה כבר נמדד מ-git ומ-GitHub, מה חסר, איך למדוד, מי בודק, ומה
מוסרים. אחרי אישור, הסשן הזה שומר את התדריך ואת הנתונים הגולמיים שאסף ב-`.work/system-audit/` על הענף
`ccr-21b5fcdf-l5yns9` ודוחף פעם אחת (בלי PR — אין ריצת CI ואין deploy ל-push כזה). הסשן המקומי קורא משם.

---

## חלק 1 — מה כבר נמדד (מקורות: git, GitHub API, קבצי הרשומות)

### 1.1 ציר זמן וקצב

| מדד | ערך | מקור |
|---|---|---|
| תכנון בלי ריפו | 12.9.2026: 16 החלטות (`decisions/2026-09.md`) · 10.10: SRS עובר ל-markdown, "Consolidate all project files" | git, decisions |
| commits ב-main | 172 (‏10.10–16.10). לפי יום: 10.10 = 13 · 11.10 = 57 · 12.10 = 70 · 13.10 = 9 · 14.10 = 11 · 15.10 = 6 · 16.10 = 6 (מ-12.10 מיזוגים הם squash ולכן יום = PRs) | `git log origin/main` |
| PRs | 36 (‏12.10–16.10). **מוצר: 11** (‏#3 UI-f · ‏#15/16/17 F1.1 a/b/c · ‏#19 F1.2 · ‏#22 F1.3 · ‏#25 F1.4 · ‏#29 F1.5 · ‏#31 F1.6+E · ‏#33 E-2 · ‏#35 F1.8). **תהליך/כלים/רשומות: 25** (‏#6 נסגר בלי מיזוג) | GitHub |
| I1 מקצה לקצה | PR 15 נפתח 13.10 21:26 → PR 35 מוזג 16.10 15:21 = ‏~66 שעות ל-7 פיצ'רים + E ⇒ **~2.5 פיצ'רים ביום** (יעד: 10) | GitHub |
| זמן PR פתוח→מוזג (מוצר) | ‏#15 1:36 · ‏#16 4:36 · ‏#17 2:06 · ‏#19 0:42 · ‏#22 2:12 · ‏#25 12:07 (לילה) · ‏#29 2:13 · ‏#31 13:36 (לילה) · ‏#33 0:54 · ‏#35 1:49. **חסר:** זמן מ-intake עד push ראשון — רק בתמלילים | GitHub |
| גודל הפיצ'רים (שורות +) | F1.1 ‏7,828 · F1.2 ‏3,216 · F1.3 ‏2,994 · F1.4 ‏7,953 · F1.5 ‏5,579 · F1.6+E ‏11,357 · E-2 ‏964 · F1.8 ‏2,607 | `git show --shortstat` |
| הערכות קודמות ברשומות | 15.10: "21 מתוך 29 PRs תהליך" · "ORCHESTRATOR ב-300–900K הקשר, 7,400 תורות opus" · "15.4 שעות המתנה לאפיק בתוך סשנים" · "156 חסימות guard" · "36% ריצות CI אדומות" · F1.5 spec→re-check ‏2:15 | `decisions/2026-10.md:1508-1541` |
| | 13.10: ‏~2,000 שורות מוצר מול ~7,700 מערכת סוכנים ו-~8,100 לוגים; "148 commits ב-4 ימים, 40 (27%) רק לוגים" | `decisions/2026-10.md:902,946-973` |
| דוח המהירות המקורי (15.10) | **לא קיים בריפו** — רק המספרים ששרדו ב-decisions | סוכן הסקר |

### 1.2 CI ו-GitHub Actions (324 ריצות, 11.10–16.10)

| מדד | ערך |
|---|---|
| ריצות CI (ci.yml) | ‏~160: **101 ירוקות · 22 אדומות · 13 בוטלו** (ב-300 שנותחו) + 24 הראשונות (11–12.10): **22 אדומות על main** שאיש לא קרא (escapes 12.10) |
| משך CI | ממוצע ירוקה 9.0 דק׳, מקסימום 26.6; ‏~1,170 דקות runner ב-300 הריצות |
| אדומות לפי יום | 13.10: 5/34 · 14.10: 10/45 · 15.10: 4/27 · 16.10: 3/17 |
| ריצות לענף פיצ'ר (ריצות/אדומות) | register-account-create **15/5** · password-recovery **10/4** (+2 בוטלו) · identity-platform-a 6/3 · register-profile-step 6/2 · identity-platform-c 5/2 · e-cleanup 5/2 · identity-platform-b 4/1 · google-sign-in 2/1 · login-session 3/0 · app-shell-guard 2/0 · ui-wave-1/part-f 4/0 · main 35/0 |
| preview-smoke | 65 דולגו · 47 ירוקות · 1 אדומה — רץ על כל deployment |
| preview-e2e (E) | 13 ריצות אמיתיות, כולן ירוקות, ‏1.4–2.8 דק׳ |
| migrate | 7 ירוקות; על main ההמתנה לאישור db-production: **135, 44, 159 דקות** |
| הערה | ‏CI על PR מפעיל 9 jobs, כל אחד עם `npm ci` משלו; ‏`test:build` לא רץ ב-CI כלל |

### 1.3 איכות — מה נמצא ועל ידי מי (מהרשומות; לאמת בתמלילים)

| מקור | ממצאים |
|---|---|
| CRITIC | כל פיצ'רי המוצר: Validated with Concern. ‏Not Ready: F1.3, ‏UI-wave c, ‏i1-prep, ‏dev-speed, ‏speed-up-2, ‏guard-allowlist ×2, ‏guard-env-paths, ‏agent-slim s1 ×2. סה"כ ממצאים ב-findings.md: **~200 (H 17 · M 57 · L 127)**, מהם ~116 על פיצ'רי מוצר ו-~85 על כלים ותהליך (סכימה מטבלת סוכן הסקר; לאמת). ל-noise.md הגיע **ממצא CRITIC אחד** |
| escapes.md | **4**: CI אדום על main 22 ריצות בלי שאיש יקרא · 2 כשלי guard · טסט שלא חובר ל-CI. רק אחד נוגע לקוד מוצר |
| noise.md | **25** רשומות: **23 חסימות שווא של ה-guard**, 1 CRITIC, 1 CI |
| incidents.md | 69 שורות: 44 "hook blocked" (25 env · 4 secret-scan · 14 הסלמות reader) · 21 resolution · 4 אירועים אמיתיים; ‏archive/incidents-blocks: 113 שורות (11–13.10) |
| debt.md | **75** רשומות (14 שולמו, 6 התקבלו לצמיתות, ~24 על ה-guard) |
| security-privacy-open.md | **48** סעיפים: 16 🔴 · 13 ⏭️ · 18 ⚖️ · 3 🔍 · 0 ✅ |
| אפיק (Preview ידני) | F1.4: ‏503 ב-Preview (migration לא הוחל) · F1.8: תיקון as-built (`providers`) · בדיקות 1–6 ב-F1.5 |
| ה-guard גם היום | **3 חסימות שווא על הבודקים בענן בתוך 20 דקות** (‏glob בשם קובץ, `.[]` של jq); נכתבו 2 שורות ל-`incidents.md` בעץ העבודה — **לא ל-commit; `git checkout -- incidents.md` לפני תחילת הבדיקה המקומית** |

### 1.4 גודל המערכת מול המוצר (HEAD `a98b29a`)

| שכבה | שורות |
|---|---|
| מוצר: ‏web src ~6.8K (מזה 1.1K stories) · server src 2.5K · shared 0.8K · migrations 0.66K | **~10K** |
| טסטים: ‏web 9.1K · server 7.3K · shared 1.3K · pgTAP 4.2K · e2e 6.7K · e2e-preview 0.4K | **~29K** (יחס ~2.9×; בשרת 2.96×) |
| כלים `tools/` 8.8K · hooks 3.0K (‏guard.js 894 + 2,049 טסטים) · workflows 1,065 | **~13K** |
| מערך הסוכנים: 7 הגדרות 1,062 · 15 skills ~900 · CLAUDE.md 344 · workflow 329 · learning 221 · knowledge 731 | **~3.6K** |
| רשומות: decisions/2026-10 1,783 (118 החלטות ב-7 ימים) · WORKPLAN 168+271 · debt 102 · incidents 104+120 · ‏.work 121 קבצים | |
| הקשר נטען לסוכן (בייטים, 13.10 → אחרי agent-slim) | ORCHESTRATOR 164K → 66K · BUILDER 150K → 51K |
| מודלים (frontmatter) | SPEC/BUILDER/CRITIC/TEST ENGINEER = **sonnet** · DATA ARCHITECT/ALGORITHM & DATA = opus · SCOUT = haiku; "CRITIC על opus בדגל סיכון" קיים רק בפרוזה; ORCHESTRATOR = opus |

### 1.5 מצב הקוד והתשתית (נקודות לבדיקה)

- RLS: 8 טבלאות, כולן ENABLE+FORCE, 17 policies, 0 SECURITY DEFINER, 0 views — נקי. ‏`app_jobs` נוצר בלי grants.
- 12 routes ב-web, **6 מהם placeholders**; 5 endpoints בשרת, 2 ציבוריים (health, recovery/reset).
- ‏AC-111..116 (שחזור סיסמה) לא מופיעים בשום שם טסט למרות קריטריון היציאה של I1. ‏visual regression: baselines ל-3 מסכים בלבד (כולם F1.6).
- ‏`user-event` מיובא ב-15 קבצי טסט בלי הצהרה ב-`apps/web/package.json`.
- Actions בתגיות `@v4` (לא SHA) כולל ב-job שמחזיק את סוד ה-prod (S-50).
- README ו-`docs/design/README.md` לא מעודכנים (83 FR מול 93; "R2 ממתין"; "push חסום").
- ‏roadmap מול SRS: 93 FR/52 PG/116 AC מול 83/44/78 ב-roadmap; ‏FR-SET-002 ו-FR-ADMIN-011 בלי Initiative; ‏WORKPLAN עדיין "79 פיצ'רים".
- רכיבים שנבנו ולא בשימוש: Avatar, ‏3 אייקונים; תיקיות ריקות; probes חד-פעמיים; ‏lockfile שני ב-`tools/`.
- ‏Expo: לא מוזכר בשום מקום מלבד OP-002 ו-"apps/mobile later".

### 1.6 מה נשאר לבנות (roadmap + תיקונים 1–3)

I2 ‏5 · I3 ‏9 · I4 ‏5 · I5 ‏5 · I6 ‏6 · I7 ‏4 · I8 ‏5 · I9 ‏5 · I10 ‏5 · I11 ‏10 · I12 ‏5 · I13 ‏5 · I14 ‏4 = **73 פיצ'רים** (I15 = 5 מחוץ להצגה), + תוכן הדמו (10.4, 10.6–10.8) + Expo (בלי Initiative, בלי OP מוכרע מלבד OP-002).
**אקסטרפולציה גסה:** בקצב I1 (‏~2.5/יום) ‏≈ 29 ימי עבודה ‏≈ 6 שבועות; ביעד (10/יום) ‏≈ 7–8 ימים. אין הערכות גודל ל-Initiative בשום רשומה.

---

## חלק 2 — מה חסר ואפשר למדוד רק במחשב של אפיק

1. **תמלילי הסשנים** `~/.claude/projects/<escaped-cwd>/*.jsonl` (ותיקיות ה-subagents): קריאות מודל, מודל לכל קריאה,
   טוקנים, עלות, זמני המתנה לאפיק (פערים בין הודעות user), זמן לכל שלב (spec/build/test/review/CI), לולאות תיקון.
2. **יומן ה-guard** `.claude/logs/blocks.jsonl` (מסובב ב-/wrap-up — לבדוק אם נשמרו סבבים ישנים).
3. **`.live/events.jsonl`** (יומן ישן, לא ב-git) — אם עדיין קיים, מקור נוסף לזמנים.
4. בדיקה אמפירית של ה-guard ושל ה-skills על המכונה האמיתית (Windows) — בלי לשנות.

---

## חלק 3 — שיטת הבדיקה

### 3.0 מבנה התמליל (אומת מול תמליל הסשן הזה, Claude Code 2.1.301)

- סשן ראשי: `~/.claude/projects/<escaped-cwd>/<sessionId>.jsonl` (‏escaped-cwd = הנתיב עם `/`, `\` ו-`:` מוחלפים ב-`-`,
  למשל `C--Users-afik-Nestly`). ‏subagents: `<sessionId>/subagents/agent-<agentId>.jsonl` + `agent-<agentId>.meta.json`
  (‏`agentType`, ‏`toolUseId` = מזהה קריאת ה-Agent של ההורה — מפתח החיבור). רשומות subagent נושאות `isSidechain:true`
  ו-`agentId`.
- כל רשומה: `type` (‏user · assistant · system · summary · …), `uuid`, `parentUuid`, `timestamp`, `sessionId`, `cwd`,
  `gitBranch`, `promptId`, `isSidechain`, `requestId` (‏assistant בלבד). שדה `slug` הוא כינוי סשן, **לא** הפיצ'ר.
- ‏`message.model`, ‏`message.usage` = `{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
  cache_creation:{ephemeral_1h_input_tokens, ephemeral_5m_input_tokens}}`; ‏thinking נכלל ב-output.
- ‏`message.content[]`: ‏`text` · ‏`thinking` · ‏`tool_use` (‏`name`, ‏`input`; ל-`Agent`: ‏`subagent_type`, ‏`model?`, ‏`prompt`) ·
  ‏`tool_result` (‏`is_error`, ‏`content`).
- **חסימת guard** = `tool_result` עם `is_error:true` שתוכנו מתחיל ב-
  `PreToolUse:<Tool> hook error: [node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-loader.js" <role>]: Blocked by .claude/hooks/guard.js: <reason>`.
  מיפוי reason→rule לפי מחרוזות guard.js: ‏r4-critical (‏".env files", ‏"nestly-prod", ‏"Force push", ‏"looks like", ‏"staged") ·
  ‏r4 (‏"git add -A", ‏"separate commands") · ‏reader (‏"CRITIC …", ‏"TEST ENGINEER …", ‏"OUTSIDE") · ‏builder (‏"BUILDER …") ·
  ‏guard-error. ‏`.claude/logs/blocks.jsonl` (‏`{time, role, tool, rule, reason, session}`) מסובב ב-/wrap-up ולכן מחזיק רק את
  המשימות האחרונות — התמלילים הם המקור הראשי, היומן ו-incidents.md (44 שורות) הם הצלבה.

### 3.1 כריית התמלילים — `audit-mine.mjs` (‏Node ≥ 20, קריאה בלבד, יושב ב-`~/nestly-audit/`, לא בריפו)

קלט: תיקיית הפרויקט, רצפת תאריך 10.10.2026, טבלת מחירים `prices.json`, שורות הסשנים ב-WORKPLAN (וב-archive), רשימת
ה-slugs ב-`.work/`, ו-`raw/prs.csv` + `raw/ci-runs.csv` (מהענן; להשלים עם `gh pr list --json …` / `gh run list --limit 400 --json …`
שמורים לקובץ — בלי `--jq`).

לכל קובץ, שורה-שורה (‏`readline`, דילוג על שורות לא תקינות):

1. **איחוד רשומות assistant לפי `requestId`** — תשובת API אחת נכתבת כ-2–9 רשומות עם אותו usage; לספור usage פעם אחת,
   לאחד את בלוקי התוכן. רשומה בלי usage → קריאה עם 0 טוקנים ודגל `no_usage`.
2. **קריאות לפי מודל** — `message.model` (חסר → `unknown`).
3. **טוקנים לפי מודל** — ‏input, ‏output, ‏cache_creation (‏5m/1h), ‏cache_read. **גודל הקשר בקריאה** = input + cache_creation +
   cache_read; לדווח max ו-p50 לסשן (זה המדד של "300–900K").
4. **עלות (USD, מחיר מחירון)** = Σ לפי מודל: ‏`input×P_in + output×P_out + cache_5m×P_in×1.25 + cache_1h×P_in×2 + cache_read×P_in×0.1`.
   המחירים **פרמטרים** ב-`prices.json`, ממולאים מדף המחירים של Anthropic בזמן הריצה ונרשמים ב-`raw/prices-used.json`.
   אפיק משלם מנוי, ולכן זו עלות-הזדמנות, לא חשבונית.
5. **subagents** — כל `tool_use` בשם `Agent` בשרשור הראשי → `{subagent_type, model||inherited, ts}`; חיבור ל-`agentId` דרך
   `meta.json.toolUseId`; המודל האמיתי = `message.model` ברשומות ה-subagent (האמת על "opus בפרוזה"). משך = ראשונה→אחרונה
   בקובץ. הטוקנים מתגלגלים לסשן ההורה ולפיצ'ר.
6. **כלים** — היסטוגרמת `tool_use.name` (ראשי מול sidechain) + הפועל הראשון של פקודות Bash.
7. **חסימות guard** — לפי 3.0: `{ts, session, agentId, agentType, role, rule, tool, reason[:120]}`. סיווג "שווא" — מול noise.md (23)
   ובידי המאמת.
8. **פערי זמן** — בשרשור הראשי בלבד, בין רשומות עוקבות; פער > 10 דק׳ שמסתיים ברשומת `user` שתוכנה מחרוזת (טקסט אנושי;
   ‏tool_result הוא מערך) = **המתנה לאפיק**; אחרת `other` (‏CI, קריסה, שינה). לתייג לפי מה שקדם: ‏`AskUserQuestion`, טקסט
   עם `BLOCKER`/`ממתין לך`/`Gate`, או `git push`. פער > 3 שעות מפצל את הקובץ ל-"runs".
9. **דחיסה (compaction)** — רשומה עם `isCompactSummary:true`, ‏`type:summary` או טקסט user שמתחיל "This session is being
   continued" → לספור `compactions`; הטקסט לא נכנס לשום מדד.
10. **מיפוי לפיצ'ר** — לפי (א) `gitBranch`, (ב) כל `tool_use.input` שמכיל `.work/<slug>/`, (ג) שורות "התקדמות מוצר" ב-WORKPLAN.
    סשן שנוגע בכמה slugs מתפצל לפי תור: כל תור מקבל את ה-slug האחרון שהוזכר. בלי slug → `process/other`.
11. **לולאות תיקון CI** — מ-`ci-runs.csv`: ריצה `failure` ואחריה `headSha` חדש באותו ענף = לולאה. הצלבה בתמליל: `git push` אחרי
    tool_result שמכיל תוצאת ריצה אדומה. לדווח שני המספרים.

פלט ב-`raw/`: ‏`sessions.csv` (‏session, feature, start, end, span_h, active_h, waiting_h, calls, calls_by_model, tokens_by_model,
cost_usd, max_context, compactions, blocks) · ‏`subagents.csv` · ‏`tools.csv` · ‏`blocks.csv` · ‏`gaps.csv` · ‏`turns.csv` (שורה לכל
קריאה: ‏ts, session, agentId, model, phase, tokens). **phase** של תור = ה-`subagent_type` האחרון שהופעל לפניו בשרשור הראשי
(‏spec → spec · builder → build · test-engineer → tests · critic/algorithm-data → review · data-architect → data · scout → search ·
אין → orchestration); זמן CI = push → הרשומה הבאה שמזכירה תוצאת ריצה.

מקרי קצה: נתיבי Windows; **התמליל של סשן הבדיקה עצמו ושל הסשן בענן מ-16.10 מוחרגים**; ‏thinking בתוך output; רשומות
`ListAgents`/`SendMessage` של מוניטור ה-PR; סשן עם `cwd` מחוץ לריפו מתעלמים ממנו.

### 3.2 הגדרות המדדים — חלק א'

יחידות: **פיצ'ר** = `.work/<slug>` עם לפחות PR מוצר אחד (‏diff נוגע ב-`apps/`, ‏`packages/`, ‏`supabase/migrations`, ‏`api/`): 7 ב-I1.
**חלק** = יחידת push בתוך פיצ'ר (‏a/b/c ב-result.md ובכותרות findings). **PR תהליך** = diff שנשאר ב-`.claude/`, רשומות, `tools/`,
`.github/`, `docs/`. **Elevated מול Standard לפי חלק**: דגל סיכון ב-spec.md (רשימת CLAUDE.md) או כותרת findings "CRITIC on
opus"; בלי שניהם = Standard. כל מדד מדווח בסך הכול, לפיצ'ר, ובפיצול Elevated/Standard.

| מדד | מקור | נוסחה |
|---|---|---|
| קצב | `prs.csv` | פיצ'רי מוצר שמוזגו ÷ ימים קלנדריים 10.10–16.10, ו-÷ ימי עבודה שמופיעים בתמלילים; יעד 10/יום |
| זמן קיר לפיצ'ר | `sessions.csv` | הרשומה הראשונה של הסשן הראשון שנוגע ב-slug → mergedAt |
| זמן פעיל | `turns.csv` | זמן קיר − פערים > 10 דק׳ |
| פיצול שלבים | `turns.csv.phase` | חלק הזמן הפעיל לכל שלב; CI = Σ push→תוצאה; המתנה = Σ פערי "אפיק" |
| קריאות לפיצ'ר | `turns.csv` | קריאות מאוחדות לפי מודל, מול יעד workflow 8–12 לחלק |
| עלות לפיצ'ר | 3.1.4 | USD + טוקנים לפי מודל; חלק ה-subagents מול הלולאה הראשית |
| הקשר | `sessions.csv.max_context` | max ו-p50; סשנים מעל 300K |
| באג אמיתי | findings, debt, escapes, commits התיקון | פריט בחומרה ≥ medium ש-commit התיקון שלו שינה קובץ מוצר שאינו טסט, או escape; **הערה שולית** = low, או תיקון שנגע רק בהערות/docs/טסטים/רשומות; **רעש** = שורת noise.md, דחייה של אפיק, או בלי תיקון ובלי שורת debt |
| מי מצא | ‏findings (CRITIC/A&D) · טסט שנכשל לפני התיקון (TEST ENGINEER) · CI אדום עם סיבה רשומה (CI) · ‏preview-e2e אדום (E) · "בדיקה ידנית"/טקסט של אפיק (אפיק) · escapes (אחרי מיזוג) | מוצא אחד לבאג, הראשון בזמן |
| איכות הביקורת | כותרות findings | סבבים לפיצ'ר (≤ 2), רצף verdicts, תוצאת re-check, שיעור רעש = רעש ÷ (אמיתי + שולי + רעש) לכל שער |
| CI | `ci-runs.csv` | ריצות, % אדום, דקות ממוצע, דקות לפיצ'ר, ריצות לענף, לולאות תיקון, חלק הביטולים, ריצות על PR רשומות |
| אבטחה | security-privacy-open (48), policies, חסימות r4-critical, secret-scan | פתוחים לפי גיל וחומרה; RLS; חסימות קריטיות אמיתיות מול שווא |
| כללים | decisions (120), CLAUDE.md, workflow | כל כלל מתויג: נאכף ב-harness (‏hook/settings/CI) מול פרוזה בלבד; הופר = escapes/incidents שמצטטים אותו; לא הופעל מעולם |
| עצירות | `gaps.csv` | AskUserQuestion / BLOCKER / Gate לפיצ'ר, שעות המתנה (הצלבה: 15.4), שאלות שנענו "ברירת המחדל" |
| עודף | git stats, רשומות | טסטים÷מוצר (מול 2× קשיח), שורות כלים, חלק PR-תהליך (21/29, 25/36), שורות רשומות לפיצ'ר, עלות חסימות שווא (תורות אחרי חסימה), קריאות מעל יעד, סשנים מעל 300K |

### 3.3 חלק ב' — ‏~73 הפיצ'רים שנותרו

1. **מלאי**: שורה לפיצ'ר מ-roadmap.md (טבלה + תיקונים 1–3) ומקובצי ה-Initiatives, עם FR/AC, ‏Initiative, ודגלי הסיכון
   המשתמעים מטקסט ה-FR (‏DATA ARCHITECT? ‏ALGORITHM & DATA לפי "Reviewers beyond the path"? מדיה? כסף? ספק?).
2. **סוגי עבודה** (אחד לפיצ'ר, לפי התוצר הדומיננטי): ‏screen (‏I2, I6, וחלקים בכל Initiative) · ‏feed+ranking (‏I3, תת-I15) ·
   ‏media+moderation+stories (‏I5) · ‏admin+enforcement (‏I4, I14) · ‏marketplace (‏I12, I13 תשלום מדומה) · ‏chat (‏I8) ·
   ‏notifications+search (‏I7) · ‏professionals+services (‏I11) · ‏groups (‏I10) · ‏terms+privacy+launch (‏I9) · ‏demo content
   (‏seed, מדריכים, מאמרים) · ‏Expo app (מחוץ ל-roadmap: ‏shell, auth, feed, chat ב-React Native; "להעביר, לא לשכתב", C8).
3. **מסלול לסוג**: ‏screen → Standard (‏CRITIC sonnet, בלי DATA ARCHITECT, עומק 🎨); כל סוג אחר נושא דגל → Elevated
   (‏DATA ARCHITECT, ‏CRITIC opus; ‏ALGORITHM & DATA לפיד/דירוג, התראות, Marketplace, קבוצות, בעלי מקצוע; הערת Trust &
   Safety ל-I3/I5/I8/I10/I12). לכל פיצ'ר: חלקים צפויים (‏schema / server / screens), ביקורות (≤ 2), migrations, ספקים חיצוניים
   (‏Turnstile, Storage, Cloudflare CSAM, ממשק תשלום), שערי אפיק (‏Gate 1, ‏Gate 2 על בלתי-הפיך, ‏OP פתוחים).
4. **הערכה א' — קצב נוכחי**: מחלק א' חציונים לחלק: שעות פעילות, שעות המתנה, דקות CI, קריאות ו-USD, ל-Standard ול-Elevated;
   פיצ'ר = Σ חלקיו (+ מכפיל סוג לפיד/מדיה/צ'אט שאין להם מקביל ב-I1, מוצהר כהנחה, למשל ×1.5 לראשון-מסוגו). סכום
   ל-Initiative ולכול; ‏p50 ו-p80.
5. **הערכה ב' — אחרי מיטוב**: אותם סכומים עם ההפחתות שההצעות מניחות, כטווחים קשורים להצעה (למשל "המתנה −60..80% אם
   השערים מאוגמים"; "דקות CI −40..60% עם path filters על PR רשומות"; "קריאות −30..50% עם ביקורת אחת לפיצ'ר"). טבלת הנחות;
   בלי מספר אחד בלי טווח.
6. **שרשרת תלויות** (‏roadmap "Depends on"): ‏I2 → I3 → I4; ‏I5 ← I2,I3,I4; ‏I6 ← I2; ‏I7 ← I2,I3; ‏I8 ← I2,I4,I7; ‏I9 ← I1–I8;
   ‏I10 ← I3,I4,I7; ‏I11 ← I3,I5,I8; ‏I12 ← I5,I8; ‏I13 ← I11,I12; ‏I14 ← I4. **נתיבים מקבילים**: אחרי I2: ‏I3 ∥ I6; אחרי I3: ‏I4 ∥ I7;
   אחרי I4: ‏I5 ∥ I14; אחרי I7+I4: ‏I8; אחרי I5+I8: ‏I11 ∥ I12; אז I13; ‏I9 במקביל ל-I10–I14 אחרי I8. **נתיב קריטי**:
   I2→I3→I4→I5→I11→I13 (וגם I2→I3→I7→I8→I11). תוכן הדמו אחרי מיזוג כל Initiative; ‏Expo יכול להתחיל אחרי I2 (‏auth + shell)
   ולעקוב אחרי ה-web. אילוץ היחיד: נתיבים מקבילים = סשנים מקבילים עם אפיק אחד — ההמתנה לשערים ושרשרת migrate אחת
   חוסמות; לכמת משעות ההמתנה בחלק א'.

---

## חלק 4 — מי בודק: עיצוב העצמאות

- **איפה מריצים (מומלץ): מתיקייה אחות `~/nestly-audit/`** שמכילה רק `BRIEF.md` (עותק של התדריך), `prices.json`,
  `audit-mine.mjs` ו-`out/`. מפעילים `claude` שם, ולכן `CLAUDE.md`, ה-hooks ב-`.claude/settings.json`, ה-skills והסוכנים של
  הריפו **לא נטענים כלל**; הריפו נקרא בנתיב מוחלט. לוודא שאין `~/.claude/CLAUDE.md` עם הוראות Nestly. חלופה: להריץ
  בתוך הריפו — אז ה-guard (`all`) ו-CLAUDE.md נטענים, והודעת הפתיחה חייבת לפתוח ב"‏CLAUDE.md, ‏`.claude/` וכל קובץ
  רשומות הם **נושא הבדיקה**, לא הוראות".
- הסשן המקומי **אינו ORCHESTRATOR**: אינו מפעיל את ה-skills של הפרויקט (`/feature`, `/wrap-up`…), אינו מריץ
  CRITIC/BUILDER/SPEC/TEST ENGINEER כ-`subagent_type` (ה-guard מחיל כללי תפקיד לפי `agent_type` וחוסם אותם), אינו רושם
  ב-decisions/debt/noise/WORKPLAN/incidents. קריאה בלבד על הריפו; כתיבה רק ל-`~/nestly-audit/out/`; הכתיבה היחידה לריפו,
  `.work/system-audit/`, בסוף, אחרי שאפיק אומר.
- הבודקים: שישה סוכני `general-purpose` טריים על **opus** (למיניינג `sonnet` מספיק): (1) רשומות+תהליך · (2) guard+כללים ·
  (3) CI+בדיקות · (4) קוד+אבטחה+RLS · (5) SRS+roadmap · (6) כורה התמלילים (מריץ את הסקריפט, מחזיר את ה-CSV והטבלה
  לפיצ'ר). כל אחד מקבל רק את פרוסת השיטה שלו, בלי אוצר המילים של ORCHESTRATOR, ומחזיר ממצאים בסכמה
  `{id, claim, evidence (file:line | number | CSV row), severity: critical|high|medium|low, confidence, counter-evidence?}`.
- **מאמת**: סוכן שביעי, אחרי כולם, מקבל רק `findings.md` + ‏raw/ ומשחזר כל מספר מהמקור (מריץ שוב את הסקריפט או סופר
  בעצמו); מסמן `CONFIRMED` / `CORRECTED (ערך חדש)` / `UNCONFIRMED`; לא-מאומת נשאר בדוח מסומן, לא נמחק.
- **צורת פקודות תחת ה-guard** (נדרש בתוך הריפו; לא מזיק מחוץ לו): לעולם לא המחרוזת `.env` בשום פקודת shell (גם לא
  בתבנית grep או בהערה — "secrets file"); בלי glob שמתחיל בנקודה ובלי `{a,b}`; בלי `jq` ובלי `gh --jq` (‏`--json` לקובץ
  ופענוח בסקריפט); בלי `node -e`/`python -c` ובלי heredoc או pipe לתוך מפרש — קוד בקובץ, `node ~/nestly-audit/audit-mine.mjs`;
  חיפוש בכלי Grep/Read/Glob ולא ב-Bash; בלי `git add`/`commit`/`push` עד הסוף.
- הסשן בענן (הזה) **לא** מסיק מסקנות: הוא מסר נתונים ומדידות בלבד (חלק 1), ו"מובילים לבדיקה" (חלק 5) מנוסחים
  כשאלות, לא כקביעות. התמליל של הסשן הזה ושל סשן הבדיקה עצמו מוחרגים מהנתונים.

---

## חלק 5 — מובילים לבדיקה (שאלות, לא מסקנות)

1. לאן הולך הזמן: כמה מ-66 השעות של I1 הן בנייה, כמה בדיקות, כמה ביקורת, כמה CI (‏~9 דק׳ × 1–15 ריצות לפיצ'ר), כמה
   המתנה לאפיק (לילות, אישורי migrate 44–159 דק׳), כמה תקלות (guard, טסטים ישנים, 503 ב-Preview)?
2. 25 מתוך 36 PRs הם תהליך: כמה מהם היו הכרחיים (CI אדום, guard חוסם עבודה) וכמה בניית-מערכת שלא החזירה זמן?
3. ה-guard: ‏~156 חסימות עד 15.10, 23 מ-25 רשומות ה-noise, ~24 רשומות debt, 2,900 שורות קוד וטסטים, 3 חסימות על
   הבודקים היום. מה הוא מנע בפועל (כמה חסימות היו אמיתיות ומה היה קורה בלעדיהן)?
4. CRITIC: ~200 ממצאים (17 high), 1 ב-noise. כמה שינו התנהגות מוצר? כמה היו ליקויים שאפיק/משתמש היו רואים? האם "Validated
   with Concern" על כל פיצ'ר עדיין מידע? מי מצא את הבאגים האמיתיים — CRITIC, TEST ENGINEER, CI, E, אפיק?
5. טסטים: 29K שורות מול 10K מוצר; אילו שכבות (pgTAP, e2e, unit, stories, visual, tool tests, guard tests) תפסו אי פעם
   רגרסיה אמיתית? מה עלות ה-2× ההקשחה?
6. כללים כתובים ולא מבוצעים: "CRITIC על opus בדגל סיכון" מול frontmatter sonnet · ‏result ≤ 10 שורות (10 חריגות) ·
   WORKPLAN ≤ 25 שורות סטטוס (58) · AC בשם כל טסט (AC-111..116 חסרים) · "8–12 קריאות לפיצ'ר" (לא נמדד מעולם) ·
   `Implements:` ב-commit.
7. כללים שמבוצעים ולא מועילים: ‏preview-smoke על כל deployment · Edge אחרי מיזוג · line budgets · check:stories ·
   רישום 118 החלטות ב-7 ימים · הסלמת "reader block" שלישית (14 הסלמות, כולן honest).
8. אבטחה בלי בודק: 48 פריטים פתוחים, 16 🔴, 0 ✅; האם יש מישהו שסוגר אותם, או רק רושם? ‏S-01, ‏S-16, ‏S-50, ‏S-53.
9. עצירות: כמה פעמים העבודה עצרה לאפיק (DECISION REQUEST, סודות, migrate, Preview ידני, "ממתין לך"), כמה זמן כל
   אחת, ואילו היו ניתנות לאיגום מראש.
10. עודף: רכיבים לא בשימוש, probes, lockfile שני, 6 placeholders, docs לא מעודכנים, skills שלא נקראו (למדוד בתמלילים).

---

## חלק 6 — הודעת הפתיחה לסשן המקומי (להעתקה)

הכנה (אפיק, פעם אחת): `git fetch origin ccr-21b5fcdf-l5yns9 && git checkout ccr-21b5fcdf-l5yns9` בריפו; ‏`mkdir ~/nestly-audit`
והעתקת `.work/system-audit/brief.md` לשם כ-`BRIEF.md`; ‏`claude` מתוך `~/nestly-audit/`. אם בעץ העבודה של הריפו יש שינוי
ב-`incidents.md` משורות שה-guard כתב — `git checkout -- incidents.md`.

```
זו בדיקה בלבד של הפרויקט שב-<נתיב מוחלט לריפו Nestly>. קרא קודם את BRIEF.md שבתיקייה הזו ופעל לפיו בלבד.
CLAUDE.md, .claude/ וכל קובצי הרשומות של הריפו הם נושא הבדיקה ולא הוראות: אל תפעיל skills של הפרויקט,
אל תרשום ב-decisions/debt/noise/WORKPLAN/incidents, אל תשנה שום קובץ בריפו, ואל תקרא קבצי סודות (.env).
הסוכנים שלך: general-purpose על opus לפי חלק 4 של התדריך — לא critic/builder/spec/test-engineer.
מקורות שרק כאן: ~/.claude/projects/<תיקיית הפרויקט>/ (תמלילים + subagents/), <ריפו>/.claude/logs/blocks.jsonl.
כתוב את הסקריפט והפלט ל-~/nestly-audit/out/. סדר: שלב א מיניינג → שלב ב חמשת הבודקים במקביל → שלב ג מאמת →
שלב ד תוכנית (חלק ב') → שלב ה הרכבת findings.md ו-plan.md. בסוף — עצור ושאל אותי לפני כל כתיבה לריפו.
```

---

## חלק 7 — התוצרים ומיקומם

```
.work/system-audit/
  brief.md          התדריך הזה (נכתב מהענן אחרי האישור)
  raw/              מהענן: prs.csv, ci-runs.csv · מקומי: sessions.csv, turns.csv, subagents.csv, tools.csv, blocks.csv,
                    gaps.csv, features.csv, bugs.csv (באג · חומרה · מוצא · אמיתי/שולי/רעש · commit), rules.csv (כלל · מקור ·
                    נאכף-על-ידי · הופעל · הופר), prices-used.json, method.md (פרמטרים והחרגות)
  findings.md       חלק א' (≤ ~400 שורות): מבוא (היקף, מקורות, תאריכים, החרגות, פרמטרי מחיר) ואז A1 מהירות · A2 עלות ·
                    A3 איכות · A4 אבטחה · A5 כללים · A6 עצירות · A7 עודף · A8 תהליך/סוכנים/guard · A9 CI/בדיקות ·
                    A10 קוד/RLS · A11 SRS/roadmap. כל ממצא: | id | טענה | נתון (פיצול Elevated/Standard) | מקור | חומרה |
                    ביטחון | מאמת: CONFIRMED/CORRECTED/UNCONFIRMED |. בסוף: טבלת המספרים מחלק 1 ואם אומתו מקומית
  plan.md           חלק ב' (≤ ~300 שורות): טבלת המלאי (פיצ'ר · סוג · מסלול · חלקים · בודקים · שערים), שתי ההערכות
                    ל-Initiative עם טבלת ההנחות, תרשים התלויות והנתיבים (טקסט), "לבנות פעם אחת", הכרעות לרכז מראש
                    לכל Initiative, ואז הצעות מדורגות: | דירוג | הצעה | השפעה על זמן | על עלות | על סיכון | עלות ההצעה |
                    מתי: לפני I2 / במהלך I2–I5 / אחר כך | ממצאים תומכים |. שום דבר לא מיושם; אפיק מחליט
```

עברית. ל-raw/ לא מועתק טקסט תמליל מעבר ל-120 תווים של סיבת חסימה, ולא מחרוזות פקודה (עלולות להכיל סודות). רק
`.work/system-audit/` משתנה, ורק כשאפיק מאשר: ‏commit אחד, push אחד לענף `ccr-21b5fcdf-l5yns9`, בלי PR.

---

## חלק 8 — אימות

- כל מספר בדוח נושא מקור (קובץ:שורה, מזהה ריצה, או שם ה-CSV והשורה). סוכן האימות מריץ מחדש את החישובים
  מה-CSV ומסמן. מספר שלא שוחזר מסומן UNCONFIRMED.
- בדיקת עצמאות: ‏`git diff --stat` בסוף מראה רק `.work/system-audit/`; אין רשומה חדשה ב-decisions/debt/noise/
  WORKPLAN/incidents (מלבד השורות הידועות ש-guard עלול לכתוב — לאסוף אותן ל-raw/ ולהחזיר את הקובץ).
- בדיקת כיסוי: כל סעיף בבקשה של אפיק (מהירות · עלות · איכות · אבטחה · כללים · עצירות · עודף · חלק ב' 1–5) מופיע
  כפרק עם לפחות ממצא מגובה אחד או "לא נמדד — למה".

---

**עלות הבדיקה המקומית (הערכה):** סשן אחד, ‏~2–4 שעות קיר; מיניינג על sonnet, 5 בודקים + מאמת + מתכנן על opus — כמה
מיליוני טוקנים, רובם cache. אין ריצות CI ואין deploy עד ה-push הסופי (ואז אין PR, ולכן גם לא).

## חלק 9 — מה הסשן בענן עושה אחרי האישור

1. כותב את `.work/system-audit/brief.md` (התוכן הזה, עם חלק 3 המלא) ו-`raw/prs.csv`, ‏`raw/ci-runs.csv` מהנתונים
   שכבר נשלפו (36 PRs, 324 ריצות).
2. ‏`git add` של התיקייה בלבד (לא `incidents.md`), commit אחד, ‏`git push -u origin ccr-21b5fcdf-l5yns9`. בלי PR.
3. מוסר לאפיק את הודעת הפתיחה (חלק 6) ואת הנתיב.
