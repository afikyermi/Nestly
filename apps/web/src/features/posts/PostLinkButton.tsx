import { useLinkClickHandler } from 'react-router';
import { Button } from '@/components/ui/button';

export interface PostLinkButtonProps {
  to: string;
  children: string;
  variant?: 'primary' | 'text';
}

// A button that is a link: the app follows it in place (no page load); a modified click is left to the browser.
export function PostLinkButton({ to, children, variant = 'primary' }: PostLinkButtonProps) {
  const follow = useLinkClickHandler(to);
  return (
    <Button variant={variant} href={to} onClick={follow}>
      {children}
    </Button>
  );
}
