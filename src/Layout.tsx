import { useState } from "react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { apiGet } from "./api";
import Avatar from "./Avatar";
import ProfileEditorModal from "./ProfileEditorModal";

const NAV: { label: string; to: string; perm: string | null }[] = [
  { label: "Dashboard", to: "/", perm: null },
  { label: "Accounts", to: "/accounts", perm: "accounts" },
  { label: "Collection", to: "/collection", perm: "collection" },
  { label: "Receipts Manager", to: "/receipts", perm: "receipts" },
  { label: "Billing", to: "/billing", perm: "billing" },
  { label: "Meter Reading", to: "/reading", perm: "reading" },
  { label: "Pendings", to: "/pendings", perm: "pendings" },
  { label: "Job Orders", to: "/joborders", perm: "joborders" },
  { label: "Adjustments", to: "/adjustments", perm: "adjustments" },
  { label: "Approvals", to: "/approvals", perm: "approvals" },
  { label: "Disconnection", to: "/disconnection", perm: "disconnection" },
  { label: "ECPay", to: "/ecpay", perm: "ecpay" },
  { label: "Reports", to: "/reports", perm: "reports" },
  { label: "User Management", to: "/users", perm: "users" },
  { label: "Settings", to: "/settings", perm: "settings" },
];

const SOON = [
  "Meter Manager",
  "Cluster Manager",
  "Sequencing",
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

  const visibleNav = NAV.filter((item) => item.perm === null || can(item.perm));

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">POSEIDON</div>
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
                {item.label}
                {item.label === "Approvals" && approvalsWaiting > 0 && (
                  <span className="stage-count">{approvalsWaiting}</span>
                )}
              </NavLink>
            </li>
          ))}
          {SOON.map((label) => (
            <li key={label}>
              <span className="nav-item disabled">{label}</span>
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
