import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Toast from "./Toast.jsx";

export default function Layout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
      <Toast />
    </div>
  );
}
