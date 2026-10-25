import { describe, expect, it } from 'vitest';
import { PROFESSIONAL_FIELDS, PROFESSIONAL_FIELD_TOPICS, TOPIC_RULES, detectTopics } from '../src/index.js';

// I11 completion C (§13.4, ⭐ OP-072; FR-SERV-005, PG-057, AC-171): "בקשות עזרה" lists the posts whose text speaks of the Professional's field,
// by the shared topic words. A topic that is not a key of TOPIC_RULES would match every post, so every one is checked here.
describe('[AC-171 OP-072] the field → topic map', () => {
  it('[AC-171] every field has an entry and every topic is a known one; only "other" has none', () => {
    for (const field of PROFESSIONAL_FIELDS) {
      const topics = PROFESSIONAL_FIELD_TOPICS[field];
      for (const topic of topics) expect(TOPIC_RULES[topic], `${field} → ${topic}`).toBeDefined();
      expect(topics.length === 0, field).toBe(field === 'other');
    }
  });

  it('[AC-171] a post on sleep is a sleep consultant\'s, not a doula\'s; a post on labour is a doula\'s', () => {
    const fieldsOf = (text: string) => PROFESSIONAL_FIELDS.filter((field) => PROFESSIONAL_FIELD_TOPICS[field].some((topic) => detectTopics(text).includes(topic)));
    expect(fieldsOf('בעיות שינה בלילה')).toEqual(expect.arrayContaining(['sleep', 'parenting']));
    expect(fieldsOf('בעיות שינה בלילה')).not.toContain('doula');
    expect(fieldsOf('מתי מתחילים צירים?')).toEqual(expect.arrayContaining(['doula', 'midwife']));
    expect(fieldsOf('מתי מתחילים צירים?')).not.toContain('sleep');
  });
});
