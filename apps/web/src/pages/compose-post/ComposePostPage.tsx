import { ComposeScreen } from '@/features/posts/ComposeScreen';

// The post composer (protected, FR-FEED-002; F3.1b), at `/posts/new`. The page only composes; the screen checks and fails on its own.
export function ComposePostPage() {
  return <ComposeScreen />;
}
