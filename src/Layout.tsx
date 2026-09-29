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
  IconPowerOff, IconCreditCard, IconChartBar, IconGear, IconGauge, IconLayers, IconListOrdered,
  IconRefresh, IconAlertTriangle, IconServer, IconLogout, IconSidebar, IconMegaphone, IconSupport,
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
      if (moreIncidents > 0) {
        alerts.push({
          message: moreIncidents === 1 ? "New incident report from the mobile app" : `${moreIncidents} new incident reports`,
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
  { label: "Incident Reports", to: "/incidents", perm: "incidents", icon: IconMegaphone, mainOnly: true },
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

  // What consumers sent from the mobile app — main server only, since
  // phones only ever talk to main.
  const { data: inbox } = useMobileInbox(
    !isSatellite && (can("incidents") || can("adjustments")),
  );
  const toast = useInboxAlerts(inbox);

  /** The red count beside a nav item, if it has anything waiting. */
  const badges: Record<string, number> = {
    Approvals: approvalsWaiting,
    "Incident Reports": inbox?.incidents ?? 0,
    Adjustments: inbox?.adjustmentRequests ?? 0,
  };

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
