import { cn } from '@/lib/cn';
import { NestIcon } from '../ui/icons';

export type LogoSize = 'default' | 'big';

// The temporary wordmark (OP-022): the nest mark and the word "Nestly". This is the single
// file to replace when the final logo exists; Logo supplies the link, the accessible name and
// the target size around it. Decorative on its own: the name comes from Logo.
export function LogoWordmark({ size = 'default' }: { size?: LogoSize }) {
  return (
    <>
      <NestIcon className={size === 'big' ? 'size-10' : 'size-7'} />
      <span aria-hidden="true" className={cn('font-semibold leading-none', size === 'big' ? 'text-display' : 'text-h3')}>
        Nestly
      </span>
    </>
  );
}
