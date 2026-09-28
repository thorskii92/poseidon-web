import { useState } from "react";
import type { ReactNode, JSX } from "react";
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
  IconRefresh, IconAlertTriangle, IconServer,
} from "./NavIcons";

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
      <nav className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" className="brand-mark" />
          <span>{isSatellite ? "OSCARS" : "POSEIDON"}</span>
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
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.label === "Approvals" && approvalsWaiting > 0 && (
                  <span className="stage-count">{approvalsWaiting}</span>
                )}
              </NavLink>
            </li>
          ))}
          {SOON.map((item) => (
            <li key={item.label}>
              <span className="nav-item disabled">
                <item.icon size={18} />
                <span>{item.label}</span>
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
            {user && <Avatar userId={user.id} name={user.fullName} version={avatarVersion} size="sidebar" />}
          </div>
          <button className="link-button light" onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="content">{children}</main>

      {showProfile && <ProfileEditorModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
