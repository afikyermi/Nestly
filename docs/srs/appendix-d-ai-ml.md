[← אינדקס ה-SRS](INDEX.md)

# נספח D — הצעות המשך ותחומים פתוחים: AI/ML ואלגוריתמים מתקדמים

הפריטים הבאים אינם נדרשים להפעלת v1 ולכן אינם חוסמי פיתוח. הם נשמרים כהצעות המשך/Decision Gates שייבחנו כאשר יהיו מספיק Data, Traffic, צורך עסקי, מדיניות פרטיות ותקציב.

| תחום עתידי | מה האפשרות | מתי/מה צריך להחליט |
|---|---|---|
| AI/LLM Assistant | Chat/assistant להכוונה, סיכום או Q&A | לאחר הגדרת Use Cases, knowledge boundaries, medical safety, cost, privacy ו-fallback. אין להוסיף Chat AI רק כי הטכנולוגיה זמינה. |
| ML Learned Feed Ranking | החלפת/שילוב Scoring ידני במודל לומד | לאחר מספיק interaction data ו-baseline v1 מדיד; חייב Offline/Online evaluation ו-fallback ל-rule-based. |
| Semantic Search / Embeddings | חיפוש משמעותי מעבר Exact/Prefix/Keyword | אם Search zero-result/CTR מצדיקים; דורש vector/index strategy, privacy ובדיקות Hebrew quality. |
| Automatic Topic/Stage Classification | סיווג Posts/Articles/Products אוטומטי | אם manual/keyword metadata אינו מספיק; ML/LLM classifier עם confidence/fallback. |
| Collaborative Filtering / Similar Users | המלצות Similar Content/Users | רק לאחר volume מספיק; יש לבחון privacy/bias ו-cold start. |
| Automated Moderation / Spam/Toxicity ML | Risk scoring לדיווחים ותוכן | לא מחליף Human moderation בפעולות מהותיות ללא policy/evaluation; false positives נמדדים. |
| Predictive Satisfaction / Churn | חיזוי שביעות רצון/נטישה | אחרי הגדרת outcome אמין; לא להשתמש ב-proxy יחיד. |
| A/B Experimentation Platform | חלוקת משתמשים לניסויי Algorithm/UI | כאשר traffic מספיק; צריך experiment assignment, guardrails, metrics ו-analysis standard. |
| Advanced Ads / Auction / Bidding | Self-serve targeting, bid/auction, pacing | לא נדרש ב-v1; Brand Portal וכללי targeting דורשים product/legal החלטה נפרדת. |
| Recommendation Controls | Clear personalization history, topic controls, why-this-item | אפשר להוסיף לשקיפות/שליטה לאחר v1; מומלץ לפני ML personalization מורכב. |
| Exact Calibration | weights, decay, diversity/exploration ratio, sponsored frequency caps, thresholds | נקבע תוך QA/controlled rollout באמצעות AlgorithmConfiguration; לא לקבע מספרים שרירותיים במסמך. |
| Retention / Consent / Legal Finalization | תקופות שמירה, cookie/analytics consent, notices, privacy wording, market-specific rules | חובה לפני Production לפי OP-001 ושוק ראשון; אינה החלטת Algorithm. |
| Model Governance | provider/model/version, evaluation, red-team, cost, latency, rollback | רלוונטי רק אם AI/ML מאושר בעתיד; כל Model change חייב versioning/governance. |
