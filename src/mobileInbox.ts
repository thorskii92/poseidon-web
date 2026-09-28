import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/**
 * How many things consumers have sent from the mobile app that nobody has
 * looked at yet — new incident reports, and adjustment requests waiting on a
 * call. A count is null when this role can't open that page.
 *
 * One query key shared by the sidebar (badges and the new-item alert) and
 * both pages, so handling an item on a page updates the badge at once.
 */
export type InboxCounts = { incidents: number | null; adjustmentRequests: number | null };

export const INBOX_KEY = ["mobile-inbox"];

export function useMobileInbox(enabled = true) {
  return useQuery<InboxCounts>({
    queryKey: INBOX_KEY,
    queryFn: () => apiGet<InboxCounts>("/api/mobile-inbox/counts"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    retry: false,
    enabled,
  });
}

/** "2 hr ago" / "Sep 22, 3:14 PM" for an epoch-ms timestamp. */
export function whenMs(ms: number | null): string {
  if (!ms) return "";
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hr ago`;
  return new Date(ms).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}
