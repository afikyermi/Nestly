import {
  checkCreatePost,
  codePointLength,
  JOURNEY_STAGES,
  POST_AUDIENCES,
  POST_BODY_MAX,
  type JourneyStage,
  type PostAudience,
  type PostCreate,
} from '@nestly/shared';
import { GENERIC_ERROR_TEXT } from '@/lib/auth-texts';
import { BODY_REQUIRED_TEXT, BODY_TOO_LONG_TEXT } from './posts-texts';

/** The form as the user left it: the tag's `""` is "בלי תגית". */
export interface PostFormValues {
  body: string;
  audience: PostAudience;
  stageTag: JourneyStage | '';
  /** I11 (OP-038): asks Professionals for help (absent: no). */
  isHelpRequest?: boolean;
}

export interface PostFormErrors {
  body?: string;
  /** The audience or the tag: a control cannot produce a bad value, so this is the generic text. */
  other?: string;
}

export type PostFormCheck = { ok: true; value: PostCreate } | { ok: false; errors: PostFormErrors };

/**
 * Which anonymous post the form writes (FR-FEED-005): none (a named post, or its edit); a new anonymous post (always for everyone, the
 * audience choice kept aside, not sent); or the edit of one (the text and the tag only: its audience and anonymity never change).
 */
export type AnonymousMode = 'none' | 'create' | 'edit';

export const isAudience = (value: string): value is PostAudience => POST_AUDIENCES.some((audience) => audience === value);
export const isStageTag = (value: string): value is JourneyStage => JOURNEY_STAGES.some((stage) => stage === value);

/** Characters left before the limit, in code points like the server counts them (negative: over). */
export const charactersLeft = (body: string): number => POST_BODY_MAX - codePointLength(body);

/** The same shared rule the server applies (FR-FEED-002, FR-FEED-005; VAL on the post text). The stored text is the trimmed one. */
export function checkPostForm(values: PostFormValues, anonymous: AnonymousMode = 'none'): PostFormCheck {
  const result = checkCreatePost({
    body: values.body,
    audience: anonymous === 'none' ? values.audience : 'everyone',
    stageTag: values.stageTag === '' ? null : values.stageTag,
    ...(anonymous === 'create' ? { isAnonymous: true } : {}),
    ...(values.isHelpRequest === true ? { isHelpRequest: true } : {}),
  });
  if (result.ok) {
    if (anonymous !== 'edit') return result;
    const { body, stageTag } = result.value;
    return { ok: true, value: { ...(body === undefined ? {} : { body }), ...(stageTag === undefined ? {} : { stageTag }) } };
  }
  if (result.reason === 'body_required') return { ok: false, errors: { body: BODY_REQUIRED_TEXT } };
  if (result.reason === 'body_too_long') return { ok: false, errors: { body: BODY_TOO_LONG_TEXT } };
  return { ok: false, errors: { other: GENERIC_ERROR_TEXT } };
}
