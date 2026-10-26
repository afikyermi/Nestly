// The Marketplace, help-offer, report and promotion steps. Same rule as every step: look first, create only what is missing.
import { commentId, postId, upload } from './actions-content.ts';
import { listingBody } from './bodies.ts';
import type { Listing } from './content.ts';
import { knownMotif } from './illustration.ts';
import type { Step } from './plan.ts';
import { type Ctx, expectStatus, field, list, type Handler, StepError, stringField } from './runner.ts';

type StepOf<K extends Step['kind']> = Extract<Step, { kind: K }>;
const enc = encodeURIComponent;

function wrong(step: Step): never {
  throw new StepError(`wrong handler for ${step.kind}`);
}

function listing(ctx: Ctx, key: string): Listing {
  const found = ctx.content.listings.find((l) => l.key === key);
  if (found === undefined) throw new StepError(`unknown listing ${key}`);
  return found;
}

/** The owner's own listing card with this title, or undefined. */
async function ownListing(ctx: Ctx, l: Listing): Promise<unknown> {
  const mine = list(expectStatus(await ctx.call(l.owner, 'GET', '/api/marketplace/mine'), [200], 'my listings'), 'listings');
  return mine.find((x) => stringField(x, 'title') === l.title);
}

async function listingId(ctx: Ctx, key: string): Promise<string> {
  const known = ctx.listings.get(key);
  if (known !== undefined) return known;
  const id = stringField(await ownListing(ctx, listing(ctx, key)), 'id');
  if (id === null) throw new StepError(`listing ${key} was not found`);
  ctx.listings.set(key, id);
  return id;
}

const createListing: Handler = async (ctx, s) => {
  const step: StepOf<'listing'> = s.kind === 'listing' ? s : wrong(s);
  const l = listing(ctx, step.listing);
  const existing = stringField(await ownListing(ctx, l), 'id');
  if (existing !== null) {
    ctx.listings.set(l.key, existing);
    return 'skipped';
  }
  const images = l.image !== undefined && knownMotif(l.image) ? [await upload(ctx, step.actor, 'listing', l.image)] : [];
  const created = await ctx.call(step.actor, 'POST', '/api/marketplace/listings', listingBody(l, images));
  const id = stringField(expectStatus(created, [200, 201], 'listing'), 'id');
  if (id === null) throw new StepError('listing: no id');
  ctx.listings.set(l.key, id);
  return 'done';
};

const markSold: Handler = async (ctx, s) => {
  const step: StepOf<'listing-sold'> = s.kind === 'listing-sold' ? s : wrong(s);
  const l = listing(ctx, step.listing);
  if (stringField(await ownListing(ctx, l), 'status') === 'sold') return 'skipped';
  const id = await listingId(ctx, l.key);
  expectStatus(await ctx.call(step.actor, 'POST', `/api/marketplace/listings/${enc(id)}/status`, { status: 'sold' }), [200, 204], 'mark sold');
  return 'done';
};

const contactSeller: Handler = async (ctx, s) => {
  const step: StepOf<'listing-contact'> = s.kind === 'listing-contact' ? s : wrong(s);
  const contact = ctx.content.contacts.find((c) => c.listing === step.listing && c.from === step.actor);
  if (contact === undefined) throw new StepError('unknown contact');
  const id = await listingId(ctx, step.listing);
  const page = expectStatus(await ctx.call(step.actor, 'GET', `/api/marketplace/listings/${enc(id)}`), [200], 'listing page');
  if (stringField(page, 'conversationId') !== null) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', `/api/marketplace/listings/${enc(id)}/contact`, { text: contact.text }), [200, 201], 'contact');
  return 'done';
};

async function outreach(ctx: Ctx, actor: string, side: 'sent' | 'received'): Promise<unknown[]> {
  return list(expectStatus(await ctx.call(actor, 'GET', '/api/outreach'), [200], 'outreach'), side);
}

const offerHelp: Handler = async (ctx, s) => {
  const step: StepOf<'offer-help'> = s.kind === 'offer-help' ? s : wrong(s);
  const offer = ctx.content.helpOffers.find((h) => h.post === step.post && h.professional === step.actor);
  if (offer === undefined) throw new StepError('unknown help offer');
  const id = await postId(ctx, step.post);
  if ((await outreach(ctx, step.actor, 'sent')).some((o) => stringField(o, 'postId')?.toLowerCase() === id.toLowerCase())) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', `/api/posts/${enc(id)}/offer-help`, { text: offer.text }), [200, 201], 'offer help');
  return 'done';
};

const acceptOffer: Handler = async (ctx, s) => {
  const step: StepOf<'offer-accept'> = s.kind === 'offer-accept' ? s : wrong(s);
  const id = (await postId(ctx, step.post)).toLowerCase();
  const pro = ctx.userId(step.professional);
  const item = (await outreach(ctx, step.actor, 'received')).find(
    (o) => stringField(o, 'postId')?.toLowerCase() === id && stringField(o, 'professionalId')?.toLowerCase() === pro,
  );
  const outreachId = stringField(item, 'id');
  if (outreachId === null) throw new StepError('the help offer was not received');
  if (stringField(item, 'status') !== 'pending') return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', `/api/outreach/${enc(outreachId)}/accept`), [200, 201], 'accept offer');
  return 'done';
};

const report: Handler = async (ctx, s) => {
  const step: StepOf<'report'> = s.kind === 'report' ? s : wrong(s);
  const t = step.target;
  const target =
    t.kind === 'user'
      ? { targetKind: 'user', targetId: ctx.userId(t.user) }
      : t.kind === 'post'
        ? { targetKind: 'post', targetId: await postId(ctx, t.post) }
        : { targetKind: 'comment', targetId: await commentId(ctx, t.post, t.comment) };
  const body = { ...target, reason: step.reason, ...(step.details === undefined ? {} : { details: step.details }) };
  const result = await ctx.call(step.actor, 'POST', '/api/reports', body);
  // One report per user and target (BR-074): the second answer is a refusal, which means it is already there.
  if (result.status === 409) return 'skipped';
  expectStatus(result, [200, 201], 'report');
  return 'done';
};

const promote: Handler = async (ctx, s) => {
  const step: StepOf<'promotion'> = s.kind === 'promotion' ? s : wrong(s);
  const t = step.target;
  const target =
    t.kind === 'profile'
      ? { kind: 'profile' }
      : t.kind === 'post'
        ? { kind: 'post', postId: await postId(ctx, t.post) }
        : { kind: 'listing', listingId: await listingId(ctx, t.listing) };
  const overview = expectStatus(await ctx.call(step.actor, 'GET', '/api/promotions'), [200], 'promotions');
  const running = list(overview, 'promotions').some(
    (p) =>
      stringField(p, 'state') === 'running' &&
      stringField(p, 'targetKind') === target.kind &&
      (target.kind === 'profile' ||
        stringField(p, 'postId')?.toLowerCase() === field(target, 'postId') ||
        stringField(p, 'listingId')?.toLowerCase() === field(target, 'listingId')),
  );
  if (running) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', '/api/promotions', { planKey: step.planKey, target }), [200, 201], 'promotion');
  return 'done';
};

export const marketHandlers: Partial<Record<Step['kind'], Handler>> = {
  listing: createListing,
  'listing-sold': markSold,
  'listing-contact': contactSeller,
  'offer-help': offerHelp,
  'offer-accept': acceptOffer,
  report,
  promotion: promote,
};
