import { CheckIcon } from '../ui/icons';

// A Toast (redesign 27.10.2026, §4.2): a dark pill with a ✓, centred above the bottom navigation, for a moment after an action went through.
// It only shows what the screen's polite status region already says, so it is hidden from assistive technology (said once, not twice).
// Nothing when `text` is null; the caller decides how long it stays.
export function Toast({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-24 z-toast flex justify-center px-4 lg:bottom-8">
      <p className="m-0 inline-flex max-w-md items-center gap-2 rounded-lg bg-foreground px-4 py-3 text-label text-background shadow-raised">
        <CheckIcon className="size-5 shrink-0" />
        {text}
      </p>
    </div>
  );
}
