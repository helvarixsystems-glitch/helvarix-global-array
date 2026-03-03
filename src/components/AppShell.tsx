import React from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <div className="name">HELVARIX GLOBAL ARRAY</div>
            <div className="sub mono">Operator Console • Secure Telemetry</div>
          </div>

          <div className="pillRow">
            <div className="pill">
              <div className="label">OI</div>
              <div className="val" style={{ color: "var(--cyan)" }}>
                24,500
              </div>
            </div>
            <div className="pill">
              <div className="label">CI</div>
              <div className="val" style={{ color: "var(--violet)" }}>
                1,200
              </div>
            </div>
          </div>
        </div>

        <main>{children}</main>
      </div>

      <BottomNav />
    </>
  );
}
