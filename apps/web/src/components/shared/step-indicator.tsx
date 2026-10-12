import { cn } from '@/lib/cn';

export interface StepIndicatorProps {
  current: number;
  total: number;
}

// "שלב {current} מתוך {total}" with a bar of one segment per step. The bar repeats the text,
// so it is aria-hidden. Invalid input is a programming error and throws.
export function StepIndicator({ current, total }: StepIndicatorProps) {
  if (!Number.isInteger(current) || !Number.isInteger(total) || total < 1 || current < 1 || current > total) {
    throw new RangeError(`StepIndicator: current (${current}) must be within 1..total (${total}), total at least 1`);
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-small text-muted-foreground">
        שלב {current} מתוך {total}
      </span>
      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            data-on={index < current ? 'true' : 'false'}
            className={cn('h-1.5 flex-1 rounded-full', index < current ? 'bg-primary' : 'bg-border')}
          />
        ))}
      </div>
    </div>
  );
}
