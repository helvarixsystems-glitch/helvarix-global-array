import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export function Protected({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) nav("/auth");
      else setOk(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) nav("/auth");
      else setOk(true);
    });

    return () => sub.subscription.unsubscribe();
  }, [nav]);

  if (!ok) return <div style={{ padding: 24 }}>Loading…</div>;
  return <>{children}</>;
}
