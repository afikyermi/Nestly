import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TIMER_TEXT } from '@/lib/tracker-texts';

export interface DurationTimerProps {
  /** The timer started: the form's start becomes this moment. */
  onStart: (at: Date) => void;
  /** The timer stopped: the form's end becomes this moment. */
  onStop: (at: Date) => void;
}

const two = (value: number): string => String(value).padStart(2, '0');

/** mm:ss, or h:mm:ss from an hour. */
export function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const rest = seconds % 3600;
  const clock = `${two(Math.floor(rest / 60))}:${two(rest % 60)}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

// A start/stop timer for a duration (FR-TRACK-002: breastfeeding and sleep rest on a timer or a manual edit). Starting stamps the start
// time, stopping stamps the end time; both stay editable by hand. The running timer lives in this screen only: leaving the page ends it.
export function DurationTimer({ onStart, onStop }: DurationTimerProps) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (startedAt === null) return undefined;
    const tick = window.setInterval(() => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000);
    return () => window.clearInterval(tick);
  }, [startedAt]);

  if (startedAt === null) {
    return (
      <Button
        type="button"
        variant="soft"
        className="self-start"
        onClick={() => {
          const now = new Date();
          setSeconds(0);
          setStartedAt(now.getTime());
          onStart(now);
        }}
      >
        {TIMER_TEXT.start}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-label">
        {TIMER_TEXT.elapsed} <span role="timer" className="tabular-nums" dir="ltr">{formatElapsed(seconds)}</span>
      </span>
      <Button
        type="button"
        variant="soft"
        onClick={() => {
          setStartedAt(null);
          onStop(new Date());
        }}
      >
        {TIMER_TEXT.stop}
      </Button>
    </div>
  );
}
