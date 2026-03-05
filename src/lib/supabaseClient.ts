import { createClient } from "@supabase/supabase-js";

// Vite injects only VITE_* variables into the client bundle
const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function normalizeSupabaseUrl(url: string) {
  const trimmed = url.trim();

  // If user accidentally pastes only the project ref or domain without protocol,
  // fix it so fetch() doesn't become a relative URL on Cloudflare Pages.
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;

  // If they pasted just the project ref, build the full domain
  if (!trimmed.includes(".")) return `https://${trimmed}.supabase.co`;

  // If they pasted "<ref>.supabase.co" without protocol
  return `https://${trimmed}`;
}

if (!rawUrl || !anonKey) {
  // Fail loudly in dev + prod so you don't get mysterious 404 spam
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages."
  );
}

export const supabase = createClient(normalizeSupabaseUrl(rawUrl), anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
