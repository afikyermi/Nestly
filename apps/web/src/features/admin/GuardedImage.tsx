import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { HIDE_IMAGE, REVEAL_IMAGE } from './staff-work-texts';

// An image in a staff queue (I14 completion, Afik 21.10.2026, §9.9): blurred and in greyscale by default, so a staff member is not exposed to it
// unasked; a press shows it as it is, and another hides it again. Display only: who may see the image at all is the server's.
export function GuardedImage({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="relative w-full overflow-hidden rounded-md">
        <div className={shown ? undefined : 'blur-xl grayscale'} aria-hidden={shown ? undefined : true} data-guarded={shown ? 'shown' : 'blurred'}>
          {children}
        </div>
      </div>
      <Button variant="soft" aria-pressed={shown} onClick={() => setShown(!shown)}>
        {shown ? HIDE_IMAGE : REVEAL_IMAGE}
      </Button>
    </div>
  );
}
