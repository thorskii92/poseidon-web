import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/** Shapes of poseidon-api's reportHeader.ts — keep in step. */

export const LINE_KEYS = ["republic", "province", "header1", "header2", "officeName", "address"] as const;
export type LineKey = (typeof LINE_KEYS)[number];

export type LineStyle = {
  show: boolean; sizePt: number; color: string; bold: boolean; italic: boolean; uppercase: boolean;
};

export type LogoPlacement = "sides" | "left" | "right" | "above" | "none";

export type HeaderStyle = {
  fontFamily: string;
  republicText: string;
  provinceText: string;
  logoPlacement: LogoPlacement;
  logoSizePx: number;
  lineSpacing: number;
  lines: Record<LineKey, LineStyle>;
};

export type HeaderText = { header1: string; header2: string; officeName: string; address: string };

export type HeaderPayload = { style: HeaderStyle; text: HeaderText; fonts: string[]; defaults: HeaderStyle };

export const REPORT_HEADER_KEY = ["report-header"];

/** Loaded once and shared by every report on the page (and by the editor). */
export function useReportHeader() {
  return useQuery<HeaderPayload>({
    queryKey: REPORT_HEADER_KEY,
    queryFn: () => apiGet<HeaderPayload>("/api/report-header"),
    staleTime: 5 * 60_000,
  });
}
