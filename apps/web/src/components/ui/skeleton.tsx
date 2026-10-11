import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type SkeletonProps = Omit<ComponentProps<'div'>, 'children'>;

// A loading placeholder on the muted surface (direction.md: never a centred spinner). It is
// hidden from assistive technology: the screen that shows it announces the loading itself.
// The pulse is `motion-safe`, so it is absent under prefers-reduced-motion.
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn('h-4 w-full rounded-sm bg-muted motion-safe:animate-pulse', className)}
    />
  );
}
