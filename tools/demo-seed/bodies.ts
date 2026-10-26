// The request bodies of the demo seed, built from the content and the run's clock (pure). Each one is exactly what the web sends for
// the same action; the unit tests check every body against the product's own Zod schema from @nestly/shared.
import { LISTING_CATEGORIES, LISTING_PRICE_MIN } from '@nestly/shared';
import type { Content, Listing, Post, Professional, Regular, TrackerEvent } from './content.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD of a moment, in UTC. */
export const isoDay = (at: Date): string => at.toISOString().slice(0, 10);

function parts(day: string): { day: string; month: string; year: string } {
  const [year = '', month = '', date = ''] = day.split('-');
  return { day: date, month, year };
}

/** The due date of a pregnancy in week `week` today: 40 weeks from the last period. */
export function dueDateFor(week: number, today: Date): string {
  return isoDay(new Date(today.getTime() + (40 - week) * 7 * DAY_MS));
}

/** A birth date `months` months before today (two days earlier still, so a month boundary never makes it a day in the future). */
export function birthDateFor(months: number, today: Date): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate() - 2));
  return isoDay(d);
}

export function registrationBody(r: Regular, today: Date) {
  const pregnant = r.stages.includes('pregnant') && r.pregnancyWeek !== undefined;
  return {
    stages: r.stages,
    fullName: r.fullName,
    parentGender: r.parentGender,
    dueDate: pregnant && r.pregnancyWeek !== undefined ? parts(dueDateFor(r.pregnancyWeek, today)) : { day: '', month: '', year: '' },
    children: r.children.map((c) => ({ name: c.name, sex: c.sex, birthDate: parts(birthDateFor(c.ageMonths, today)) })),
    consent: true,
  };
}

export function professionalBody(p: Professional) {
  return {
    fullName: p.fullName,
    businessName: p.businessName,
    gender: p.gender,
    field: p.field,
    fieldOther: p.fieldOther,
    yearsExperience: p.yearsExperience,
    area: p.area,
    about: p.about,
    priceFrom: p.priceFrom,
    consent: true,
    qualification: true,
  };
}

export function postBody(post: Post, groupId: string | undefined) {
  return {
    body: post.body,
    audience: post.audience,
    ...(post.stageTag === undefined ? {} : { stageTag: post.stageTag }),
    ...(post.anonymous === true ? { isAnonymous: true } : {}),
    ...(groupId === undefined ? {} : { groupId }),
  };
}

export function groupBody(group: Content['groups'][number]) {
  return { name: group.name, description: group.description, rules: group.rules, privacy: group.privacy };
}

export function articleBody(article: Content['articles'][number]) {
  return { title: article.title, body: article.body, field: article.field, status: 'published' };
}

/** The first category the deployed product knows (a category another change adds may not exist yet), else the last preference. */
export function listingCategory(listing: Listing, known: readonly string[] = LISTING_CATEGORIES): string {
  return listing.category.find((c) => known.includes(c)) ?? listing.category[listing.category.length - 1] ?? 'other';
}

/** "למסירה": 0 when the product accepts a zero price, else null (the rule before that change). */
export function listingPrice(listing: Listing, priceMin: number = LISTING_PRICE_MIN): number | null {
  if (listing.price === 0) return priceMin <= 0 ? 0 : null;
  return listing.price;
}

export function listingBody(listing: Listing, imageIds: readonly string[], known?: readonly string[], priceMin?: number) {
  return {
    title: listing.title,
    category: listingCategory(listing, known),
    condition: listing.condition,
    price: listingPrice(listing, priceMin),
    city: listing.city,
    imageIds: [...imageIds],
  };
}

/** One tracker event, timed back from `now` (the product refuses a time more than ten minutes ahead, never one in the past). */
export function trackerBody(event: TrackerEvent, childId: string, now: Date) {
  const at = new Date(now.getTime() - event.hoursAgo * 60 * 60 * 1000);
  const end = (minutes: number | undefined) => new Date(Math.min(at.getTime() + (minutes ?? 20) * 60 * 1000, now.getTime())).toISOString();
  const base = { kind: event.kind, childId, occurredAt: at.toISOString() };
  switch (event.kind) {
    case 'breastfeeding':
      return { ...base, endedAt: end(event.minutes), choice: event.choice ?? 'left' };
    case 'sleep':
      return { ...base, endedAt: end(event.minutes) };
    case 'bottle':
      return { ...base, amountMl: event.amountMl ?? 120 };
    case 'diaper':
      return { ...base, choice: event.choice ?? 'wet' };
    case 'growth':
      return { ...base, weightKg: event.weightKg ?? null, heightCm: event.heightCm ?? null };
    case 'vaccine':
      return { ...base, name: event.name ?? '' };
    case 'bath':
      return base;
  }
}

export function cycleBody(startDaysAgo: number, cycleLengthDays: number, today: Date) {
  return { startDate: isoDay(new Date(today.getTime() - startDaysAgo * DAY_MS)), cycleLengthDays };
}
