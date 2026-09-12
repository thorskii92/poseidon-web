import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "./AuthContext";

const NAV = [
  { label: "Accounts", to: "/" },
  { label: "Collection", to: "/collection" },
  { label: "Billing", to: "/billing" },
  { label: "Meter Reading", to: "/reading" },
  { label: "Pendings", to: "/pendings" },
  { label: "Adjustments", to: "/adjustments" },
  { label: "Approvals", to: "/approvals" },
  { label: "Disconnection", to: "/disconnection" },
  { label: "Settings", to: "/settings" },
];

// Approvals used to sit here. The approval stage is one step of a bill
// adjustment, so it lives inside Adjustments rather than on its own.
const SOON = [
  "System Analytics",
  "Reports",
  "ECPAY",
  "Meter Manager",
  "Cluster Manager",
  "User Management",
  "Sequencing",
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">POSEIDON</div>
        <ul className="nav">
          {NAV.map((item) => (
            <li key={item.label}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
              >
                {item.label}
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
          <div className="user-name">{user?.fullName}</div>
          <div className="user-role">{user?.position}</div>
          <button className="link-button light" onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
