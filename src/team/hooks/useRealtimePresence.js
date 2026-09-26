import { useEffect, useRef } from "react";
import { heartbeat } from "../data/db.js";

// Throttled heartbeat — updates team_members.last_seen_at every 60s.
export function useRealtimePresence(memberId) {
  const lastPingRef = useRef(0);

  useEffect(() => {
    if (!memberId) return undefined;
    const ping = () => {
      const now = Date.now();
      if (now - lastPingRef.current < 55000) return;
      lastPingRef.current = now;
      heartbeat(memberId).catch(() => {});
    };

    ping();
    const interval = setInterval(ping, 60000);
    const onFocus = () => ping();
    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [memberId]);
}
