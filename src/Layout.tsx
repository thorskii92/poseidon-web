import { INV_REQUESTS_SEEN_KEY } from "./inventoryShared";
import { useEffect, useState } from "react";
import type { ReactNode, JSX, MouseEvent, FocusEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { apiGet } from "./api";
import Avatar from "./Avatar";
import ProfileEditorModal from "./ProfileEditorModal";
import { IconReceipt, IconInvoice, IconUsers, IconWrench, IconDroplet, type IconProps } from "./ReportIcons";
import {
  IconGrid, IconIdCard, IconWallet, IconClock, IconSliders, IconCheckCircle,
  IconPowerOff, IconCreditCard, IconChartBar, IconGear, IconGauge, IconLayers, IconListOrdered, IconBox,
  IconRefresh, IconAlertTriangle, IconServer, IconLogout, IconSidebar, IconMegaphone, IconSupport, IconMap,
  IconTrendUp,
  IconDropLoss,
  IconGlobe,
} from "./NavIcons";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "./support";
import { useMobileInbox, type InboxCounts } from "./mobileInbox";

const COLLAPSE_KEY = "poseidon.sidebarCollapsed";

function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

type IconComponent = (p: IconProps) => JSX.Element;

type InboxAlert = { message: string; to: string };

/**
 * The notifier: when a poll finds more new incident reports or mobile
 * adjustment requests than the last one did, say so — an in-app alert
 * that links to the page, plus a desktop notification when the browser
 * has been allowed to show them (Incident Reports has the button). The
 * first poll after sign-in only sets the baseline, so what was already
 * waiting shows as badges rather than a burst of alerts.
 */
function useInboxAlerts(inbox: InboxCounts | undefined) {
  const navigate = useNavigate();
  const [seen, setSeen] = useState<InboxCounts | undefined>(undefined);
  const [batch, setBatch] = useState<InboxAlert[] | null>(null);

  // Compared during render (React's "adjust state when a prop changes"
  // pattern) rather than in an effect, so a new poll result and its alert
  // land in the same render.
  if (inbox && inbox !== seen) {
    setSeen(inbox);
    if (seen) {
      const alerts: InboxAlert[] = [];
      const moreIncidents = (inbox.incidents ?? 0) - (seen.incidents ?? 0);
      const moreRequests = (inbox.adjustmentRequests ?? 0) - (seen.adjustmentRequests ?? 0);
      const moreNotices = (inbox.pendingNotices ?? 0) - (seen.pendingNotices ?? 0);
      if (moreIncidents > 0) {
        alerts.push({
          message: moreIncidents === 1 ? "New incident report from the mobile app" : `${moreIncidents} new incident reports`,
          to: "/incidents",
        });
      }
      if (moreNotices > 0) {
        alerts.push({
          message: moreNotices === 1 ? "A public notice is waiting for your approval" : `${moreNotices} public notices are waiting for your approval`,
          to: "/incidents",
        });
      }
      if (moreRequests > 0) {
        alerts.push({
          message: moreRequests === 1 ? "New bill adjustment request from the mobile app" : `${moreRequests} new mobile adjustment requests`,
          to: "/adjustments",
        });
      }
      if (alerts.length) setBatch(alerts);
    }
  }

  // Desktop notifications are the outside world — sent once per batch.
  useEffect(() => {
    if (!batch || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const a of batch) {
      const n = new Notification("POSEIDON", { body: a.message, tag: a.to });
      n.onclick = () => {
        window.focus();
        navigate(a.to);
      };
    }
  }, [batch, navigate]);

  // Stays up long enough to be noticed, then gets out of the way.
  useEffect(() => {
    if (!batch) return;
    const t = setTimeout(() => setBatch(null), 15_000);
    return () => clearTimeout(t);
  }, [batch]);

  const current = batch?.[0] ?? null;
  const setCurrent = (v: null) => setBatch(v);

  return {
    current,
    dismiss: () => setCurrent(null),
    open: (a: InboxAlert) => {
      setCurrent(null);
      navigate(a.to);
    },
  };
}

type NavItem = { label: string; to: string; perm: string | null; icon: IconComponent; satelliteOnly?: boolean; mainOnly?: boolean; satelliteAlwaysOn?: boolean; alsoFor?: string[] };

/** Pinned to the top and bottom of the sidebar, in this order; everything else is A–Z between them. */
const NAV_FIRST = ["Dashboard"];
const NAV_LAST = ["User Management", "Settings", "IT Dashboard"];

function sortNav(items: NavItem[]) {
  const rank = (label: string) =>
    NAV_FIRST.includes(label) ? -100 + NAV_FIRST.indexOf(label) : NAV_LAST.includes(label) ? 100 + NAV_LAST.indexOf(label) : 0;
  return [...items].sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
}

// Listed in any order — sortNav puts them in sidebar order, so a new page just gets added here.
const NAV: NavItem[] = sortNav([
  { label: "Dashboard", to: "/", perm: null, icon: IconGrid },
  { label: "Accounts", to: "/accounts", perm: "accounts", icon: IconIdCard },
  // Applications sent in from the official website (partner API).
  { label: "Online Applications", to: "/online-applications", perm: "accounts", icon: IconGlobe, mainOnly: true },
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
  { label: "Approvals", to: "/approvals", perm: "approvals", icon: IconCheckCircle, alsoFor: ["invapprove", "routeapprove"] },
  { label: "Incidents & Emergencies", to: "/incidents", perm: "incidents", icon: IconMegaphone, mainOnly: true },
  { label: "Disconnection", to: "/disconnection", perm: "disconnection", icon: IconPowerOff },
  { label: "ECPay", to: "/ecpay", perm: "ecpay", icon: IconCreditCard, mainOnly: true },
  // Staff who can only file or approve supply requests get just the Requests tab.
  { label: "Inventory", to: "/inventory", perm: "inventory", icon: IconBox, mainOnly: true, alsoFor: ["invrequest", "invapprove"] },
  { label: "Meter Manager", to: "/meters", perm: "meters", icon: IconGauge },
  { label: "Cluster Manager", to: "/clusters", perm: "clusters", icon: IconLayers },
  { label: "Sequencing", to: "/sequencing", perm: "sequencing", icon: IconListOrdered },
  { label: "GIS Map", to: "/map", perm: "gis", icon: IconMap },
  { label: "Demand Forecast", to: "/forecast", perm: "forecast", icon: IconTrendUp },
  { label: "Non-Revenue Water", to: "/nrw", perm: "nrw", icon: IconDropLoss },
  { label: "Reports", to: "/reports", perm: "reports", icon: IconChartBar },
  { label: "User Management", to: "/users", perm: "users", icon: IconUsers },
  { label: "Settings", to: "/settings", perm: "settings", icon: IconGear },
  { label: "Synchronization", to: "/sync", perm: "sync", icon: IconRefresh, satelliteOnly: true },
  { label: "Sync Conflicts", to: "/sync-conflicts", perm: "sync", icon: IconAlertTriangle, mainOnly: true },
  { label: "IT Dashboard", to: "/it", perm: "it", icon: IconServer },
]);

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
  // Supply requests waiting for approval count toward the same badge
  // (Approvals → Inventory Requests). Same query key as that tab and
  // Inventory → Requests, so a decision there updates this too.
  // One call feeds both badges: Approvals (requests to approve) and
  // Inventory (to release, and the requester's own news since they last
  // opened Requests — see InventoryRequests.tsx, which records that).
  const { data: invWaiting } = useQuery<{ toApprove: number; toRelease: number; mine: { updates: number } }>({
    queryKey: ["inv-requests", "waiting", "nav"],
    queryFn: () => {
      let since = 0;
      try {
        since = Number(localStorage.getItem(INV_REQUESTS_SEEN_KEY)) || 0;
      } catch {
        /* storage blocked: every update counts as new */
      }
      return apiGet(`/api/inventory/requests/waiting?since=${since}`);
    },
    retry: false,
    refetchInterval: 60_000,
    enabled: can("invapprove") || can("invrequest") || can("inventory"),
  });
  const { data: prWaiting } = useQuery<{ toApprove: number }>({
    queryKey: ["inv-purchasing", "waiting"],
    queryFn: () => apiGet<{ toApprove: number }>("/api/inventory/purchasing/waiting"),
    retry: false,
    refetchInterval: 60_000,
    enabled: can("invapprove"),
  });
  // Readers asking to download a route over the internet (Approvals → Route downloads).
  const { data: routeWaiting } = useQuery<{ waiting: number }>({
    queryKey: ["route-requests", "count"],
    queryFn: () => apiGet<{ waiting: number }>("/api/route-requests/count"),
    retry: false,
    refetchInterval: 30_000,
    enabled: can("routeapprove"),
  });
  // Online applications waiting for review (OnlineApplicationsPage).
  const { data: onlineWaiting } = useQuery<{ pending: number }>({
    queryKey: ["online-applications", "count"],
    queryFn: () => apiGet<{ pending: number }>("/api/online-applications/count"),
    retry: false,
    refetchInterval: 60_000,
    enabled: can("accounts"),
  });
  const approvalsWaiting = (approvals?.length ?? 0) + (invWaiting?.toApprove ?? 0) + (prWaiting?.toApprove ?? 0) + (routeWaiting?.waiting ?? 0);

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

  // What consumers sent from the mobile app — main server only, since
  // phones only ever talk to main.
  const { data: inbox } = useMobileInbox(
    !isSatellite && (can("incidents") || can("adjustments")),
  );
  const toast = useInboxAlerts(inbox);

  /** The red count beside a nav item, if it has anything waiting. */
  const badges: Record<string, number> = {
    Approvals: approvalsWaiting,
    Inventory: (invWaiting?.toRelease ?? 0) + (invWaiting?.mine?.updates ?? 0),
    "Incidents & Emergencies": (inbox?.incidents ?? 0) + (inbox?.pendingNotices ?? 0),
    Adjustments: inbox?.adjustmentRequests ?? 0,
    "Online Applications": onlineWaiting?.pending ?? 0,
  };

  const visibleNav = NAV.filter((item) => {
    const permOk = item.perm === null || can(item.perm) || (item.alsoFor ?? []).some((p) => can(p)) || (item.satelliteAlwaysOn && isSatellite);
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
                  badges[item.label] ? `${item.label} (${badges[item.label]})` : item.label,
                )}
              >
                <span className="nav-icon">
                  <item.icon size={18} />
                  {!!badges[item.label] && <span className="nav-dot" />}
                </span>
                <span className="nav-label">{item.label}</span>
                {!!badges[item.label] && (
                  <span className="stage-count">{badges[item.label]}</span>
                )}
              </NavLink>
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
          <a
            className="sidebar-support"
            href={SUPPORT_MAILTO}
            title={`Email ${SUPPORT_EMAIL}`}
            {...tipProps(`Contact support — ${SUPPORT_EMAIL}`)}
          >
            <IconSupport size={18} />
            <span className="nav-label">
              Contact support
              {/* Spelled out: a shared office PC often has no email app,
                  so clicking the link may do nothing. */}
              <span className="sidebar-support-email">{SUPPORT_EMAIL}</span>
            </span>
          </a>
        </div>
      </nav>
      {collapsed && tip && (
        <div className="sidebar-tip" style={{ top: tip.top }} role="tooltip">
          {tip.label}
        </div>
      )}
      <main className="content">{children}</main>

      {toast.current && (
        <div className="inbox-toast" role="status">
          <button className="inbox-toast-body" onClick={() => toast.open(toast.current!)}>
            <IconMegaphone size={20} />
            <span>{toast.current.message}</span>
          </button>
          <button className="inbox-toast-close" onClick={toast.dismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {showProfile && <ProfileEditorModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
