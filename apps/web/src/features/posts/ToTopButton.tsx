import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpIcon } from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { TO_TOP_LABEL } from './feed-texts';

// "חזרה למעלה" (F3.2b c20): from 1024 px, while the shell is narrower than 72rem, only the icon fits beside the column and the hidden text
// still names the button; the tooltip then shows the same words (NFR-USAB-004; ux-polish-b c9). Where the text is shown it is the label: no tooltip.
export function ToTopButton({ onClick }: { onClick: () => void }) {
  const labelId = useId();
  const textRef = useRef<HTMLSpanElement>(null);
  const [iconOnly, setIconOnly] = useState(false);
  // The button sits in the shell's action bar, outside every landmark: its tooltip is drawn in `main` (axe "region").
  const [main, setMain] = useState<HTMLElement | null>(null);
  useEffect(() => setMain(document.querySelector<HTMLElement>('main')), []);
  useEffect(() => {
    const text = textRef.current;
    if (text === null) return;
    const measure = () => setIconOnly(getComputedStyle(text).display === 'none');
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // The text's box vanishes and returns as the shell crosses 72rem.
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, []);
  return (
    <Tooltip label={TO_TOP_LABEL} disabled={!iconOnly} container={main}>
      <Button variant="soft" className="shadow-card" aria-labelledby={labelId} onClick={onClick}>
        <ArrowUpIcon className="hidden size-5 lg:@max-6xl:block" />
        <span ref={textRef} id={labelId} className="lg:@max-6xl:hidden">
          {TO_TOP_LABEL}
        </span>
      </Button>
    </Tooltip>
  );
}
