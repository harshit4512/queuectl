import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ListOrdered,
  Skull,
  Settings,
  Cpu,
  LogOut,
} from "lucide-react";
import useStore from "../store/store.js";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/jobs", icon: ListOrdered, label: "Jobs" },
  { to: "/dlq", icon: Skull, label: "Dead Letter Queue" },
  { to: "/workers", icon: Cpu, label: "Workers" },
  { to: "/config", icon: Settings, label: "Configuration" },
];

export default function Sidebar() {
  const { user, logout } = useStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="sidebar">
      <div className="logo-container">
        <span className="logo-icon">👷</span>
        QueueCTL
      </div>

      <nav className="nav-links">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="user-badge">
            <div className="user-avatar">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{user.username}</span>
              <span className="user-role">{user.role}</span>
            </div>
          </div>
        )}
        <button
          className="btn btn-outline"
          style={{ width: "100%", justifyContent: "flex-start", gap: "0.5rem" }}
          onClick={handleLogout}
          id="btn-logout"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
