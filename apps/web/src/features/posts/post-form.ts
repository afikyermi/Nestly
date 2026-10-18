import {
  checkCreatePost,
  codePointLength,
  JOURNEY_STAGES,
  POST_AUDIENCES,
  POST_BODY_MAX,
  type JourneyStage,
  type PostAudience,
  type PostWrite,
} from '@nestly/shared';
import { GENERIC_ERROR_TEXT } from '@/lib/auth-texts';
import { BODY_REQUIRED_TEXT, BODY_TOO_LONG_TEXT } from './posts-texts';

/** The form as the user left it: the tag's `""` is "בלי תגית". */
export interface PostFormValues {
  body: string;
  audience: PostAudience;
  stageTag: JourneyStage | '';
}

export interface PostFormErrors {
  body?: string;
  /** The audience or the tag: a control cannot produce a bad value, so this is the generic text. */
  other?: string;
}

export type PostFormCheck = { ok: true; value: PostWrite } | { ok: false; errors: PostFormErrors };

export const isAudience = (value: string): value is PostAudience => POST_AUDIENCES.some((audience) => audience === value);
export const isStageTag = (value: string): value is JourneyStage => JOURNEY_STAGES.some((stage) => stage === value);

/** Characters left before the limit, in code points like the server counts them (negative: over). */
export const charactersLeft = (body: string): number => POST_BODY_MAX - codePointLength(body);

/** The same shared rule the server applies (FR-FEED-002; VAL on the post text). The stored text is the trimmed one. */
export function checkPostForm(values: PostFormValues): PostFormCheck {
  const result = checkCreatePost({
    body: values.body,
    audience: values.audience,
    stageTag: values.stageTag === '' ? null : values.stageTag,
  });
  if (result.ok) return result;
  if (result.reason === 'body_required') return { ok: false, errors: { body: BODY_REQUIRED_TEXT } };
  if (result.reason === 'body_too_long') return { ok: false, errors: { body: BODY_TOO_LONG_TEXT } };
  return { ok: false, errors: { other: GENERIC_ERROR_TEXT } };
}
