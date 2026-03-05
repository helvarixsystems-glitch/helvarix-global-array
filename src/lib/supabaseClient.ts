// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Hard guard: if this isn't absolute, the browser will treat it as a relative path on Cloudflare,
// causing the exact 404 spam you’re seeing.
if (!env.supabaseUrl.startsWith("http://") && !env.supabaseUrl.startsWith("https://")) {
  throw new Error(
    `Invalid SUPABASE URL at runtime: "${env.supabaseUrl}". ` +
      `It must start with https://. Check your VITE_SUPABASE_URL value in Cloudflare Pages.`
  );
}

// Optional: runtime check in production console
declare global {
  interface Window {
    __HGA_SUPABASE_URL__?: string;
  }
}
if (typeof window !== "undefined") {
  window.__HGA_SUPABASE_URL__ = env.supabaseUrl;
}

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
