import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type NotificationRow = {
  id: string;
  user_id: string;
  ride_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const TOAST_INTERACTIVE_DELAY_MS = 1200;

const getEventKey = (n: Pick<NotificationRow, "user_id" | "ride_id" | "type" | "title" | "message">) =>
  `${n.user_id}:${n.ride_id ?? "none"}:${n.type}:${n.title}:${n.message}`;

const isSameEvent = (a: NotificationRow, b: NotificationRow) =>
  a.user_id === b.user_id &&
  (a.ride_id ?? "") === (b.ride_id ?? "") &&
  a.type === b.type &&
  a.title === b.title &&
  a.message === b.message;

const dedupeRows = (rows: NotificationRow[]) => {
  const byId = new Set<string>();
  const byEvent = new Set<string>();
  const deduped: NotificationRow[] = [];

  for (const row of rows) {
    if (byId.has(row.id)) continue;
    const eventKey = getEventKey(row);
    if (byEvent.has(eventKey)) continue;
    byId.add(row.id);
    byEvent.add(eventKey);
    deduped.push(row);
  }

  return deduped;
};

export function useNotifications(userId?: string) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const recentToastKeysRef = useRef<Map<string, number>>(new Map());
  const interactiveRef = useRef(false);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      interactiveRef.current = true;
    }, TOAST_INTERACTIVE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      interactiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;

    const shouldShowToast = (row: NotificationRow) => {
      const now = Date.now();
      for (const [key, ts] of recentToastKeysRef.current.entries()) {
        if (now - ts > DUPLICATE_WINDOW_MS) recentToastKeysRef.current.delete(key);
      }

      const eventKey = getEventKey(row);
      const lastSeen = recentToastKeysRef.current.get(eventKey);
      if (lastSeen && now - lastSeen < DUPLICATE_WINDOW_MS) return false;

      recentToastKeysRef.current.set(eventKey, now);
      return true;
    };

    (async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && isMounted && data) {
        setItems(dedupeRows(data as NotificationRow[]));
      }
    })();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new as NotificationRow;

          setItems((prev) => {
            if (prev.some((n) => n.id === newRow.id || isSameEvent(n, newRow))) {
              return prev;
            }
            return [newRow, ...prev];
          });

          if (
            newRow.type !== "new_ride" &&
            interactiveRef.current &&
            shouldShowToast(newRow)
          ) {
            toast(newRow.title, {
              description: newRow.message,
              id: `notif-${newRow.user_id}-${newRow.ride_id ?? "none"}-${newRow.type}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markAllRead = async () => {
    if (!userId) return;
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);

    if (!error) {
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  return { items, unreadCount, markAllRead };
}
