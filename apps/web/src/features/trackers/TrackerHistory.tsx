import type { TrackerEventDto } from '@nestly/shared';
import { Button } from '@/components/ui/button';
import { HISTORY_TEXT } from '@/lib/tracker-texts';
import { describeEvent, formatWhen } from './describe-event';

export interface TrackerHistoryProps {
  events: TrackerEventDto[];
  /** Child names by id, shown when the history holds more than one child. */
  childNames: Map<string, string>;
  onEdit: (event: TrackerEventDto) => void;
  onRemove: (event: TrackerEventDto) => void;
}

// The events of the chosen period, newest first (FR-TRACK-001 "history"). Edit and delete are the owner's; the server decides again.
export function TrackerHistory({ events, childNames, onEdit, onRemove }: TrackerHistoryProps) {
  if (events.length === 0) return <p className="rounded-lg bg-muted p-4 text-body text-muted-foreground">{HISTORY_TEXT.empty}</p>;
  const showChild = childNames.size > 1;
  return (
    <ul aria-label={HISTORY_TEXT.title} className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-card p-3 text-card-foreground shadow-card">
          <div className="min-w-0 flex-1">
            <p className="text-label">
              {describeEvent(event)}
              {showChild ? <span className="ms-2 font-normal text-muted-foreground">{childNames.get(event.childId)}</span> : null}
            </p>
            <p className="text-small text-muted-foreground">
              <time dateTime={event.occurredAt}>{formatWhen(event.occurredAt)}</time>
            </p>
            {event.note !== null ? <p className="text-small text-foreground" dir="auto">{event.note}</p> : null}
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="text" onClick={() => onEdit(event)}>
              {HISTORY_TEXT.edit}
            </Button>
            <Button type="button" variant="text" onClick={() => onRemove(event)}>
              {HISTORY_TEXT.remove}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
