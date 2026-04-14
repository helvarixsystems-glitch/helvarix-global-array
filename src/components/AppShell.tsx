import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { signOut } from "../lib/auth";
import { BottomNav } from "./BottomNav";

const metaMap: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "HELVARIX GLOBAL ARRAY",
    subtitle: "Amateur astronomy collaboration, observation logging, and shared science.",
  },
  "/globe": {
    title: "NETWORK ARRAY",
    subtitle: "Global observer activity, node health, and current collection windows.",
  },
  "/telemetry": {
    title: "TELEMETRY FEED",
    subtitle: "Recent community observations and verification status.",
  },
  "/submit": {
    title: "SUBMISSION CONSOLE",
    subtitle: "Structured observation intake for imaging, spectral, and radio work.",
  },
  "/leaderboard": {
    title: "LEADERBOARD",
    subtitle: "Contribution stats, streaks, and community ranking signals.",
  },
  "/collective": {
    title: "RESEARCH COLLECTIVE",
    subtitle: "Membership, premium workflow tools, and campaign participation.",
  },
  "/profile": {
    title: "PROFILE & ACCOUNT",
    subtitle: "Callsign, identity, subscription, and user preferences.",
  },
  "/auth": {
    title: "OPERATOR ACCESS",
    subtitle: "Sign in or create your Helvarix Global Array account.",
  },
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  const isAuthPage = location.pathname === "/auth";
  const isProfilePage = location.pathname === "/profile";
  const meta = metaMap[location.pathname] ?? metaMap["/"];

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setEmail(data.session?.user.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setEmail(session?.user.email ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate("/auth", { replace: true });
  }

  return (
    <>
      <div className="shell">
        <header className="topbar">
          <div>
            <Link to="/" className="brandName">{meta.title}</Link>
            <div className="brandSub">{meta.subtitle}</div>
          </div>

          <div className="topbarActions">
            {isProfilePage ? (
              email ? (
                <>
                  <div className="statusPill">
                    <span className="statusDot" />
                    <span>{email}</span>
                  </div>
                  {!isAuthPage && (
                    <button className="ghostBtn compactBtn" type="button" onClick={handleSignOut}>
                      Sign out
                    </button>
                  )}
                </>
              ) : (
                <Link to="/auth" className="ghostBtn compactBtn">
                  Sign in
                </Link>
              )
            ) : null}
          </div>
        </header>

        <main>{children}</main>
      </div>

      {!isAuthPage && <BottomNav />}
    </>
  );
}
