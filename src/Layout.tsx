import { useState } from "react";
import type { ReactNode, JSX, MouseEvent, FocusEvent } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { apiGet } from "./api";
import Avatar from "./Avatar";
import ProfileEditorModal from "./ProfileEditorModal";
import { IconReceipt, IconInvoice, IconUsers, IconWrench, IconDroplet, type IconProps } from "./ReportIcons";
import {
  IconGrid, IconIdCard, IconWallet, IconClock, IconSliders, IconCheckCircle,
  IconPowerOff, IconCreditCard, IconChartBar, IconGear, IconGauge, IconLayers, IconListOrdered,
  IconRefresh, IconAlertTriangle, IconServer, IconLogout, IconSidebar,
} from "./NavIcons";

const COLLAPSE_KEY = "poseidon.sidebarCollapsed";

function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

type IconComponent = (p: IconProps) => JSX.Element;

const NAV: { label: string; to: string; perm: string | null; icon: IconComponent; satelliteOnly?: boolean; mainOnly?: boolean; satelliteAlwaysOn?: boolean }[] = [
  { label: "Dashboard", to: "/", perm: null, icon: IconGrid },
  { label: "Accounts", to: "/accounts", perm: "accounts", icon: IconIdCard },
  { label: "Collection", to: "/collection", perm: "collection", icon: IconWallet },
  // A field collector needs to see the O.R. list regardless of their main-
  // office role grant — the module is already safe there on its own terms
  // (no Bundle Manager, no Edit O.R., cancel/delete still admin-gated; see
  // ReceiptsManagerPage.tsx and receipts.ts's own isSatellite() checks), so
  // this bypasses the "receipts" permission on a satellite specifically.
  { label: "Receipts Manager", to: "/receipts", perm: "receipts", icon: IconReceipt, satelliteAlwaysOn: true },
  { label: "Billing", to: "/billing", perm: "billing", icon: IconInvoice },
  { label: "Meter Reading", to: "/reading", perm: "reading", icon: IconDroplet },
  { label: "Pendings", to: "/pendings", perm: "pendings", icon: IconClock },
  { label: "Job Orders", to: "/joborders", perm: "joborders", icon: IconWrench },
  { label: "Adjustments", to: "/adjustments", perm: "adjustments", icon: IconSliders },
  { label: "Approvals", to: "/approvals", perm: "approvals", icon: IconCheckCircle },
  { label: "Disconnection", to: "/disconnection", perm: "disconnection", icon: IconPowerOff },
  { label: "ECPay", to: "/ecpay", perm: "ecpay", icon: IconCreditCard, mainOnly: true },
  { label: "Reports", to: "/reports", perm: "reports", icon: IconChartBar },
  { label: "User Management", to: "/users", perm: "users", icon: IconUsers },
  { label: "Settings", to: "/settings", perm: "settings", icon: IconGear },
  { label: "Synchronization", to: "/sync", perm: "sync", icon: IconRefresh, satelliteOnly: true },
  { label: "Sync Conflicts", to: "/sync-conflicts", perm: "sync", icon: IconAlertTriangle, mainOnly: true },
  { label: "IT Dashboard", to: "/it", perm: "it", icon: IconServer },
];

const SOON: { label: string; icon: IconComponent }[] = [
  { label: "Meter Manager", icon: IconGauge },
  { label: "Cluster Manager", icon: IconLayers },
  { label: "Sequencing", icon: IconListOrdered },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, can, avatarVersion } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  // The collapsed rail's hover labels. Drawn outside the sidebar (fixed
  // position), since the sidebar scrolls and would clip anything poking out.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* just won't be remembered */
      }
      return !c;
    });
    setTip(null);
  }

  /** Hover handlers that show the label beside an icon — collapsed only. */
  function tipProps(label: string) {
    if (!collapsed) return {};
    return {
      onMouseEnter: (e: MouseEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTip({ label, top: r.top + r.height / 2 });
      },
      onMouseLeave: () => setTip(null),
      onFocus: (e: FocusEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTip({ label, top: r.top + r.height / 2 });
      },
      onBlur: () => setTip(null),
      "aria-label": label,
    };
  }

  // 403s for anyone who isn't an approver (see permissions.ts) — that's
  // fine, it just means no badge, so this never retries or surfaces an
  // error. Shares ApprovalsPage's query key so acting on a request there
  // invalidates the sidebar count too.
  const { data: approvals } = useQuery<unknown[]>({
    queryKey: ["adjust-approvals"],
    queryFn: () => apiGet<unknown[]>("/api/adjustment/approvals"),
    retry: false,
    refetchInterval: 60_000,
    enabled: can("approvals"),
  });
  const approvalsWaiting = approvals?.length ?? 0;

  // Synchronization only makes sense on a satellite deployment — hidden on
  // the ordinary main server, where /api/sync/status still 200s (just with
  // isSatellite: false) so this never shows an error, just no nav item.
  const { data: syncStatus } = useQuery<{ isSatellite: boolean }>({
    queryKey: ["sync-status"],
    queryFn: () => apiGet<{ isSatellite: boolean }>("/api/sync/status"),
    retry: false,
    enabled: can("sync"),
  });
  const isSatellite = syncStatus?.isSatellite ?? false;

  const visibleNav = NAV.filter((item) => {
    const permOk = item.perm === null || can(item.perm) || (item.satelliteAlwaysOn && isSatellite);
    if (!permOk) return false;
    if (item.satelliteOnly && !isSatellite) return false;
    if (item.mainOnly && isSatellite) return false;
    return true;
  });

  return (
    <div className="shell">
      <nav className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand">
          <img src="/favicon.svg" alt="" className="brand-mark" />
          <span className="nav-label">{isSatellite ? "OSCARS" : "POSEIDON"}</span>
          <button
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            <IconSidebar size={18} collapsed={collapsed} />
          </button>
        </div>
        <ul className="nav">
          {visibleNav.map((item) => (
            <li key={item.label}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
                {...tipProps(
                  item.label === "Approvals" && approvalsWaiting > 0
                    ? `${item.label} (${approvalsWaiting})`
                    : item.label,
                )}
              >
                <span className="nav-icon">
                  <item.icon size={18} />
                  {item.label === "Approvals" && approvalsWaiting > 0 && (
                    <span className="nav-dot" />
                  )}
                </span>
                <span className="nav-label">{item.label}</span>
                {item.label === "Approvals" && approvalsWaiting > 0 && (
                  <span className="stage-count">{approvalsWaiting}</span>
                )}
              </NavLink>
            </li>
          ))}
          {SOON.map((item) => (
            <li key={item.label}>
              <span className="nav-item disabled" {...tipProps(`${item.label} (coming soon)`)}>
                <span className="nav-icon">
                  <item.icon size={18} />
                </span>
                <span className="nav-label">{item.label}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="sidebar-user">
          <div className="sidebar-user-row">
            <button className="sidebar-user-info" onClick={() => setShowProfile(true)}>
              <div className="user-name">{user?.fullName}</div>
              <div className="user-role">{user?.position}</div>
            </button>
            {user && (
              <button
                className="sidebar-avatar-button"
                onClick={() => setShowProfile(true)}
                {...tipProps(user.fullName || "Profile")}
              >
                <Avatar userId={user.id} name={user.fullName} version={avatarVersion} size="sidebar" />
              </button>
            )}
          </div>
          <button className="link-button light sidebar-signout" onClick={signOut} {...tipProps("Sign out")}>
            <IconLogout size={18} />
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </nav>
      {collapsed && tip && (
        <div className="sidebar-tip" style={{ top: tip.top }} role="tooltip">
          {tip.label}
        </div>
      )}
      <main className="content">{children}</main>

      {showProfile && <ProfileEditorModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
