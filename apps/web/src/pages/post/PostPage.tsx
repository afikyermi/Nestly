import { useParams } from 'react-router';
import { PostContent } from '@/features/posts/PostContent';
import { PostScreen } from '@/features/posts/PostScreen';
import { postIdOfPath } from '@/lib/post-link';

// One post (protected, FR-FEED-002; F3.1b), at `/posts/<post id>`. Something that is not a post id is the same "unavailable" as a
// post that is missing. The screen is keyed by the post, so opening another one starts from nothing.
export function PostPage() {
  const { postId = '' } = useParams();
  const id = postIdOfPath(`/posts/${postId}`);
  if (id === null) return <PostContent view={{ kind: 'unavailable' }} />;
  return <PostScreen key={id} postId={id.toLowerCase()} />;
}
