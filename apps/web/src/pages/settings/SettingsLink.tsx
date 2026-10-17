import type { ReactNode } from 'react';
import { useLinkClickHandler } from 'react-router';
import { Button } from '@/components/ui/button';

// A link out of Settings, followed in the same tab through the router (a modified click stays the browser's).
export function SettingsLink({ to, children }: { to: string; children: ReactNode }) {
  const follow = useLinkClickHandler(to);
  return (
    <Button variant="text" href={to} onClick={follow}>
      {children}
    </Button>
  );
}
