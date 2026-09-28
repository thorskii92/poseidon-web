import type { IconProps } from "./ReportIcons";

/**
 * Icons for the main sidebar (Layout.tsx) — same plain-line style as
 * ReportIcons.tsx (currentColor stroke, no fill), so the two icon sets read
 * as one language rather than two. Items the sidebar already has a good
 * match for (Receipts Manager, Billing, Meter Reading, Job Orders, User
 * Management) reuse ReportIcons' IconReceipt/IconInvoice/IconDroplet/
 * IconWrench/IconUsers directly instead of duplicating them here.
 */

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconGrid({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.2" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.2" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.2" />
    </svg>
  );
}

export function IconIdCard({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.2" />
      <path d="M5.3 16.5c.6-1.6 2-2.6 3.7-2.6s3.1 1 3.7 2.6" />
      <path d="M14.5 10h4M14.5 13.3h4" />
    </svg>
  );
}

export function IconWallet({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M4 9.5h13a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5H4" />
      <circle cx="16.3" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconClock({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}

export function IconSliders({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M21 18h-1" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="7" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

export function IconCheckCircle({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.3l2.4 2.4 5-5.2" />
    </svg>
  );
}

export function IconPowerOff({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M12 4v7" />
      <path d="M7.5 6.5a7.5 7.5 0 1 0 9 0" />
    </svg>
  );
}

export function IconCreditCard({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M6.5 14.5h4" />
    </svg>
  );
}

export function IconChartBar({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 20V10M11 20V4M18 20v-6" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function IconGear({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8L6.3 6.3" />
    </svg>
  );
}

export function IconGauge({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l3.3-4.2" />
      <path d="M4 15h1.6M18.4 15H20M6.5 8.5l1.2 1.2M17.5 8.5l-1.2 1.2" />
    </svg>
  );
}

export function IconLayers({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8Z" />
      <path d="M3.5 12 12 16.5 20.5 12" />
      <path d="M3.5 16 12 20.5 20.5 16" />
    </svg>
  );
}

export function IconListOrdered({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M9.5 6h11M9.5 12h11M9.5 18h11" />
      <path d="M4 5.5h1v3M4 8.5h1.6" />
      <path d="M4 13.2c0-.7.6-1.2 1.2-1.2s1.2.5 1.2 1.1c0 .5-.3.8-.7 1.1l-1.7 1.4h2.4" />
    </svg>
  );
}

export function IconRefresh({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5" />
      <path d="M17.1 6.5h3v-3" />
      <path d="M6.9 17.5h-3v3" />
    </svg>
  );
}

export function IconServer({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <rect x="3.5" y="4" width="17" height="7" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
      <circle cx="7.3" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.3" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
      <path d="M11 7.5h6M11 16.5h6" />
    </svg>
  );
}

export function IconLogout({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
    </svg>
  );
}

/** Sidebar collapse toggle — a panel with a chevron, flipped when collapsed. */
export function IconSidebar({ size = 20, collapsed = false }: IconProps & { collapsed?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
      <path d={collapsed ? "M13 10l2 2-2 2" : "M16 10l-2 2 2 2"} />
    </svg>
  );
}

export function IconAlertTriangle({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M12 4 21 19.5H3z" strokeLinejoin="round" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.3" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
