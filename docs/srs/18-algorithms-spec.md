[← אינדקס ה-SRS](INDEX.md)

# 18. אלגוריתמים, התאמה אישית ודאטה — Specification v1

## 18.1 עקרונות v1

| ID | עיקרון |
|---|---|
| P-ALG-01 | v1 הוא Rule-Based/Scoring. אין תלות ב-ML/LLM להפעלת המערכת. |
| P-ALG-02 | כל Ranking מתחיל ב-Eligibility/Authorization ורק אחר כך Score. פרטיות והרשאות גוברות על Relevance ו-Payment. |
| P-ALG-03 | Ranking Pipeline: Signals → Candidate Generation → Ranking → Re-ranking → Delivery → Measurement/Feedback. |
| P-ALG-04 | Stage הוא Signal מרכזי ל-Regular אך אינו Hard Filter. Professional אינו מקבל child/tracker-based personalization. |
| P-ALG-05 | Organic ו-Paid נשמרים בנפרד; Money buys Reach, not Reputation. |
| P-ALG-06 | Negative Feedback, Diversity ו-Exploration הם חלק חובה מ-Re-ranking. |
| P-ALG-07 | כל weights/thresholds/decay/frequency caps הם Configuration עם versioning; אין לקבע ערכים שרירותיים ב-SRS. |
| P-ALG-08 | שינוי AlgorithmConfiguration הוא Admin Only ונרשם ב-Audit. ML/LLM עתידי דורש החלטה נפרדת. |

## 18.2 Signals מאושרים לפי סוג משתמש

| משתמש / Signal | מקורות | שימוש |
|---|---|---|
| Regular — Explicit | Search, Follow Professional, Join Group, Save, Like/Reaction, Comment/Reply, Friend/Group actions, Not Interested | Organic Ranking + current intent |
| Regular — Search Intent (החלטת אפיק מ-20.10.2026) | מכל חיפוש: הנושא או קטגוריית המוצר שזוהו בכללים קבועים (מילים לנושא, ללא ML), מזהה המשתמש והתאריך — לעולם לא הטקסט. נמחק אחרי 30 יום | Intent scoring לפוסטים, למודעות Marketplace וליועצים, אורגניים וממומנים, עם דעיכה בזמן; בלי ניתוח Admin; Sponsored Eligibility ללא שינוי |
| Regular — Implicit | Impression, Open, Dwell, profile/product/article open, sequence of topic consumption | Interest/Intent scoring; Dwell אינו Signal יחיד |
| Regular — Context | Stage/JourneyContext; Tracker category/summary only for approved contextual guidance | Organic only; no paid targeting from Child/Tracker |
| Regular — Social | Friends, joined Groups, followed Professionals | Social relevance/candidate generation |
| Professional — Explicit/Implicit | Profession/category, Groups, Professional follows, Search, content interactions, profile/content activity | Professional feed/relevance; no Child/Tracker |
| Negative | Not Interested, Show Less, report/quality flags where policy permits | Suppression/re-ranking; reports primarily moderation |
| Sponsored context | Current surface/query/category, active campaign, permitted non-sensitive context | Sponsored eligibility/paid ranking only |

**הסתרת פוסט אינה Signal** (החלטת אפיק מ-18.10.2026, 8א): היא מוציאה פוסט אחד מה-Eligibility של המשתמש שהסתיר, ואינה קלט ל-Scoring, ל-Re-ranking או ל-Interest/Intent (FR-ALG-009). דיווח על פוסט מוציא אותו מה-Eligibility של המדווח בלבד ואינו קלט לדירוג (BR-074).

## 18.3 Ranking Pipeline v1

| שלב | מה מתבצע | כלל מחייב |
|---|---|---|
| 1. Eligibility | Authorization, visibility, active status, block/context rules, campaign status | כל פריט שנכשל מוסר לפני Score. |
| 2. Candidate Generation | Friends/Groups/Follows/Public, stage/topic pools, directory/listings/products, paid pool | יוצרים pool נפרד Organic/Paid. |
| 3. Scoring | Stage/Interest/Intent/Social/Quality/Freshness או Profession/Category לפי actor | משקולות configurable/versioned. |
| 4. Re-ranking | Negative feedback, creator/topic/source diversity, exploration, safety, sponsored frequency cap | לא עוקף Eligibility. |
| 5. Delivery | Feed/Search/Directory/Marketplace/Guidance/Notifications Highlights | Sponsored label + source retained. |
| 6. Measurement | Impression/Open/Dwell/Engagement/Not Interested/Conversion | Events כוללים algorithm/config version. |

## 18.4 Algorithm Catalog — חובה ל-v1

| ID | Surface / מטרה | Inputs מרכזיים | Output | הגבלות |
|---|---|---|---|---|
| ALG-01 | Regular Feed | Stage + Interest/Intent + Friends/Groups/Follows + Quality + Freshness | Ordered Feed + modules | Diversity/negative feedback; Paid separate |
| ALG-02 | Professional Feed | Profession + Groups + Professional follows + Search/consumption + Quality/Freshness | Professional Feed | No Child/Tracker signals; בלי Friend ו-Stage (FR-ALG-003) |
| ALG-03 | Contextual Guidance | Stage + approved Topic/Tracker category/summary | Tips/Articles | General/non-diagnostic; organic only |
| ALG-04 | Professional Matching | Service/query/intent + area (עיר או אזור מרשימה, §12) + quality/activity/ratings | Professional ranking | Paid not in organic score; אין GPS |
| ALG-05 | Marketplace/Product | Query/category/intent + freshness + area (עיר או אזור מרשימה, §12) + status | Organic item ranking | Promoted/Sponsored separate; אין GPS |
| ALG-06 | Sponsored Placement | Surface/query/category + active campaign + permitted context | Sponsored units | No Child/Tracker/Chat/Support targeting; label/frequency cap |
| ALG-07 | Global Search | Authorization + exact/prefix/keyword + relevance/freshness tie-break | People/Groups/Posts results | No semantic AI required |
| ALG-08 | Negative Feedback & Diversity | Not Interested/Show Less + feed composition | Suppression/diverse feed | Exploration from eligible content only; הסתרת פוסט אינה קלט (8א) |
| ALG-09 | Group Highlights | Direct events + announcement/pinned + configurable engagement threshold | Highlights notifications | Deterministic v1 |

## 18.5 Paid Promotion — כללי דירוג ומדידה

| סוג | Eligibility/Ranking | תשלום משפיע? | השפעה |
|---|---|---|---|
| Organic Professional | Relevance/quality/activity/ratings (אין אות אימות — OP-005 נסגר, 18.10.2026) | לא | Organic rank/reputation |
| Professional Profile/Post Promotion | Sponsored eligibility + campaign + relevance | כן | Paid Reach; Promotion Analytics |
| Marketplace Listing Organic | Query/category/intent/freshness/area (עיר או אזור מרשימה, §12) | לא | Organic Marketplace rank |
| Promoted Marketplace Listing | Organic eligibility + paid campaign | כן | Paid Marketplace slot/unit |
| Sponsored Product | Admin-managed product + surface/query/category relevance + active campaign | כן | Sponsored Product unit |

כללי חובה: כל Paid unit מסומן; תשלום אינו משנה Organic Score/Reputation; Child/Tracker/Chat/Support/private-group content אינם Paid Targeting inputs; Organic/Paid metrics נשמרים בנפרד.

## 18.6 Owner/Admin Intelligence — Core Metrics v1

**היקף הצפייה (החלטת אפיק מ-18.10.2026, BR-058):** מחזיק ANALYTICS_VIEW רואה את כל הנתונים, גם ברמת משתמש בודד וגם בקבוצות קטנות, בלי מינימום, בלי שמות ובלי פרטים מזהים — מספרים ונתונים רלוונטיים בלבד. מדדים שתלויים באירועי שימוש (§13.3) — OP-039. סגמנט שלב או ילדים נשאר Aggregate בלבד עד החלטה נפרדת.

| תחום | Core Metrics | Segmentation / הערה |
|---|---|---|
| User Lifecycle | Registrations, onboarding completion, active users, D1/D7/D30 retention, return rate | Role, period, Profession — לפי BR-058 (גם ברמת משתמש, בלי שמות); Stage segment — רק אם מותר וב-Aggregate |
| Feed / Recommendation | Impressions, opens, dwell, reactions/comments/saves, hide/not interested, reports, downstream profile/product/group opens | Organic/Paid, content type, surface, algorithm/config version |
| Search | queries, zero-result rate, result CTR, top normalized queries, demand vs available results | Entity type, period; raw user query not exposed to Professionals |
| Groups | members, active members, joins, posts/comments, report rate, join approval time | Public/Private, group; privacy preserved |
| Professionals | active professionals, profile views, follows, organic reach/engagement, chat starts, offer-help acceptance | profession/category, organic/paid |
| Marketplace / Products | impressions, detail opens, chats, active listings, promoted/sponsored performance | organic/promoted/sponsored, category |
| Promotion | impressions, clicks, profile visits, follows, chat starts, spend/cost metrics if available | campaign, target type, period |
| Support | requests by category, first-response/resolution times, reopen/closed rate | category/status; body text not dashboard metric |
| Moderation / Trust | reports, action rates, warning/suspend/ban, time-to-action | content type, reason, period |
| Recommendation Quality | engagement, save, hide/not interested, source/topic/creator diversity, cold-start share | algorithm/config version, surface |
| Stage / Content Coverage | engagement/search demand מול content supply לפי Stage/Topic | Aggregate בלבד; לא לחשוף child identity |

## 18.7 Professional Analytics — גבולות v1

| קטגוריה | מדדים | כלל |
|---|---|---|
| Profile | Profile Views, Followers, follower change | Aggregate בלבד |
| Organic Content | Reach/Impressions, engagement, profile visits/chat starts from content | Organic source |
| Paid Promotion | Paid impressions/clicks/profile visits/follows/chat starts, spend/cost-derived metrics if available | Paid source; campaign-level |
| Comparison | Organic vs Paid reach/outcomes by period | אין שינוי Reputation עקב Paid |
| אסור לחשוף | מי חיפש, raw queries, child/tracker data, private user identity behind aggregate | Hard boundary |

## 18.8 Success / Evaluation Principles

| מימד | מה מודדים | עיקרון |
|---|---|---|
| Relevance | Open/Save/Follow/Join/Profile/Product downstream actions לצד Hide/Not Interested | לא למדוד הצלחה רק ב-CTR או Dwell. |
| Satisfaction proxy | Save, meaningful interaction, explicit feedback, low hide/report | Survey-based satisfaction הוא Future Enhancement. |
| Safety/Privacy | 0 unauthorized/private leakage; 0 paid use of forbidden sensitive inputs | חובה לפני כל optimization. |
| Commercial | Paid delivery measured separately from organic; no reputation contamination | Promotion success לפי downstream outcomes. |
| System Health | event completeness, duplicate rate, config version traceability, fallback success | Analytics failure לא חוסם product flow. |
