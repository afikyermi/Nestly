import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NotificationCategory,
  NotificationPreferencesResponse,
} from "@nestly/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSessionAccount } from "@/hooks/use-session-account";
import {
  fetchNotificationPreferences,
  putFriendFollow,
  putNotificationCategory,
} from "@/services/api/notifications";
import {
  CATEGORY_LABELS,
  followLabel,
  FRIENDS_FOLLOW_EMPTY,
  FRIENDS_FOLLOW_HINT,
  FRIENDS_FOLLOW_TITLE,
  LOAD_FAILED_TEXT,
  RETRY_LABEL,
  SAVE_FAILED_TEXT,
  SAVED_TEXT,
  SETTINGS_INTRO,
  SETTINGS_TITLE,
} from "./notification-texts";

type View =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; data: NotificationPreferencesResponse };

// Notification Settings (FR-NOTIF-002, FR-NOTIF-003, AC-041): a switch per category and, for Regular users, a switch per Friend whose new
// posts should notify. Each change is saved at once and reported in a status line; a failed save puts the switch back. The Mobile Push flag
// has no control on the Web (AC-074). There is no security switch: security notifications cannot be turned off (BR-038).
export function NotificationSettings() {
  const account = useSessionAccount();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  const runs = useRef(0);

  const token = useCallback(
    async () =>
      account === null
        ? null
        : await account.getAccessToken().catch(() => null),
    [account],
  );

  const load = useCallback(async () => {
    const run = (runs.current += 1);
    setView({ kind: "loading" });
    const accessToken = await token();
    const outcome =
      accessToken === null
        ? ({ kind: "failed" } as const)
        : await fetchNotificationPreferences(accessToken);
    if (run !== runs.current) return;
    setView(
      outcome.kind === "preferences"
        ? { kind: "ready", data: outcome.data }
        : { kind: "failed" },
    );
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (
    apply: (
      data: NotificationPreferencesResponse,
    ) => NotificationPreferencesResponse,
    save: (accessToken: string) => ReturnType<typeof putFriendFollow>,
  ) => {
    if (view.kind !== "ready") return;
    const before = view.data;
    setStatus("");
    setAlert("");
    setView({ kind: "ready", data: apply(before) });
    const accessToken = await token();
    const outcome =
      accessToken === null
        ? ({ kind: "failed" } as const)
        : await save(accessToken);
    if (outcome.kind === "done") setStatus(SAVED_TEXT);
    else {
      setView({ kind: "ready", data: before });
      setAlert(SAVE_FAILED_TEXT);
    }
  };

  const setCategory = (category: NotificationCategory, isEnabled: boolean) =>
    change(
      (data) => ({
        ...data,
        categories: data.categories.map((c) =>
          c.category === category ? { ...c, isEnabled } : c,
        ),
      }),
      (accessToken) =>
        putNotificationCategory(accessToken, category, isEnabled),
    );
  const setFollow = (userId: string, isEnabled: boolean) =>
    change(
      (data) => ({
        ...data,
        friends: data.friends.map((f) =>
          f.userId === userId ? { ...f, isEnabled } : f,
        ),
      }),
      (accessToken) => putFriendFollow(accessToken, userId, isEnabled),
    );

  return (
    <section
      data-settings-section="notifications"
      aria-labelledby="settings-notifications"
      className="scroll-mt-20"
    >
      <h2 id="settings-notifications" className="text-h3">
        {SETTINGS_TITLE}
      </h2>
      <p className="mt-1 text-small text-muted-foreground">{SETTINGS_INTRO}</p>
      {view.kind === "loading" ? (
        <p role="status" className="mt-2 text-muted-foreground" />
      ) : null}
      {view.kind === "failed" ? (
        <div className="mt-2">
          <p role="alert">{LOAD_FAILED_TEXT}</p>
          <Button variant="text" onClick={() => void load()}>
            {RETRY_LABEL}
          </Button>
        </div>
      ) : null}
      {view.kind === "ready" ? (
        <div className="mt-2 flex flex-col">
          {view.data.categories.map((entry) => (
            <Checkbox
              key={entry.category}
              checked={entry.isEnabled}
              onCheckedChange={(checked) =>
                void setCategory(entry.category, checked)
              }
            >
              {CATEGORY_LABELS[entry.category]}
            </Checkbox>
          ))}
          {view.data.categories.some((c) => c.category === "friend_posts") ? (
            <div className="mt-3">
              <h3 className="text-label">{FRIENDS_FOLLOW_TITLE}</h3>
              <p className="text-small text-muted-foreground">
                {FRIENDS_FOLLOW_HINT}
              </p>
              {view.data.friends.length === 0 ? (
                <p className="mt-1 text-small text-muted-foreground">
                  {FRIENDS_FOLLOW_EMPTY}
                </p>
              ) : (
                view.data.friends.map((friend) => (
                  <Checkbox
                    key={friend.userId}
                    checked={friend.isEnabled}
                    onCheckedChange={(checked) =>
                      void setFollow(friend.userId, checked)
                    }
                  >
                    {followLabel(friend.fullName)}
                  </Checkbox>
                ))
              )}
            </div>
          ) : null}
          <p role="status" className="mt-2 text-small text-muted-foreground">
            {status}
          </p>
          {alert === "" ? null : (
            <p role="alert" className="text-small text-destructive">
              {alert}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
