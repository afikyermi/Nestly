import { describe, expect, it } from 'vitest';
import { ANNOUNCEMENT_AUDIENCES, checkAnnouncement } from '../src/index.js';

// VAL-050 (I14 completion B; OP-042 closed by Afik 21.10.2026, decision 10.7): an announcement's audience is one choice of a closed list; a stage
// audience names exactly one journey stage, and no other audience names one.
describe('[VAL-050 AC-163 FR-ADMIN-008] the audience of a System Announcement', () => {
  const base = { title: 'תחזוקה', body: 'האתר ייסגר לשעה' };

  it('offers everyone, parents, Professionals and one stage; the audience is required, an edit too', () => {
    expect([...ANNOUNCEMENT_AUDIENCES]).toEqual(['everyone', 'parents', 'professionals', 'stage']);
    expect(checkAnnouncement(base).ok, 'no audience').toBe(false);
    expect(checkAnnouncement({ ...base, audience: 'parents' })).toMatchObject({ ok: true, value: { audience: 'parents', audienceStage: null } });
    for (const audience of ['everyone', 'parents', 'professionals'] as const) {
      expect(checkAnnouncement({ ...base, audience, audienceStage: null }), audience).toMatchObject({ ok: true, value: { audience, audienceStage: null } });
    }
    for (const audienceStage of ['planning', 'pregnant', 'has_child'] as const) {
      expect(checkAnnouncement({ ...base, audience: 'stage', audienceStage }), audienceStage).toMatchObject({ ok: true, value: { audience: 'stage', audienceStage } });
    }
  });

  it('refuses a stage audience without a stage, a stage on another audience, and anything outside the lists', () => {
    expect(checkAnnouncement({ ...base, audience: 'stage', audienceStage: null }).ok).toBe(false);
    expect(checkAnnouncement({ ...base, audience: 'stage' }).ok).toBe(false);
    expect(checkAnnouncement({ ...base, audience: 'parents', audienceStage: 'pregnant' }).ok).toBe(false);
    for (const audience of ['all', 'staff', 'moderators', '', null, 3]) expect(checkAnnouncement({ ...base, audience }).ok, String(audience)).toBe(false);
    expect(checkAnnouncement({ ...base, audience: 'stage', audienceStage: 'toddler' }).ok).toBe(false);
  });
});
