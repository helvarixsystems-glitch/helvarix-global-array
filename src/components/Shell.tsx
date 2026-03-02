import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function Shell() {
  return (
    <div style={{ minHeight: "100vh", paddingBottom: 84 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 16px" }}>
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
