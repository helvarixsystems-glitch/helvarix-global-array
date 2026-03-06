import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export function Protected({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setAllowed(true);
        setReady(true);
      } else {
        navigate("/auth", { replace: true, state: { from: location.pathname } });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session) {
        setAllowed(true);
        setReady(true);
      } else {
        setAllowed(false);
        navigate("/auth", { replace: true, state: { from: location.pathname } });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [location.pathname, navigate]);

  if (!ready) {
    return (
      <div className="stateCard">
        <div className="stateTitle">Loading operator session…</div>
        <div className="stateText">Checking your Helvarix identity and restoring your dashboard.</div>
      </div>
    );
  }

  return allowed ? <>{children}</> : null;
}
