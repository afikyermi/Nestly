import { useLocation } from 'react-router';
import { usePostingRight } from '@/hooks/use-posting-right';
import { CommentsView } from './CommentsView';
import { useCommentApi } from './use-comment-api';
import { useCommentWrites } from './use-comment-writes';
import { useComments } from './use-comments';

export interface CommentsSectionProps {
  postId: string;
  /** The post's own like, as it was read. */
  liked: boolean;
  likes: number;
}

// The comments under one post (F3.3 w1): the thread, the writes and the likes of the post page, composed. The post page keys it by the
// post, so another post starts from nothing. An account without the posting right (a Professional) gets no region at all; the check
// is presentation only, the server and RLS refuse whatever this shows.
export function CommentsSection(props: CommentsSectionProps) {
  const right = usePostingRight();
  return right === 'checking' || right === 'not-allowed' ? null : <CommentsRegion {...props} />;
}

function CommentsRegion({ postId, liked, likes }: CommentsSectionProps) {
  const api = useCommentApi();
  const flow = useComments(postId, { liked, likes }, api);
  const writes = useCommentWrites(postId, flow, api);
  const { hash } = useLocation();
  return <CommentsView flow={flow} writes={writes} landOnHeading={hash === '#comments'} />;
}
