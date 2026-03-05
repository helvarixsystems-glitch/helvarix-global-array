// src/lib/env.ts

export function normalizeSupabaseUrl(url: string) {
  const trimmed = (url ?? "").trim();

  // Already good
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;

  // If they pasted just the project ref
  if (trimmed && !trimmed.includes(".")) return `https://${trimmed}.supabase.co`;

  // If they pasted "<ref>.supabase.co" without protocol
  if (trimmed) return `https://${trimmed}`;

  return trimmed;
}

function get(name: string) {
  return ((import.meta as any).env?.[name] as string | undefined)?.trim() || undefined;
}

function mustGet(name: string) {
  const v = get(name);
  if (!v) {
    throw new Error(
      `Missing environment variable ${name}. Set it in Cloudflare Pages (Production + Preview).`
    );
  }
  return v;
}

export const env = {
  // Supabase (required)
  supabaseUrl: normalizeSupabaseUrl(mustGet("VITE_SUPABASE_URL")),
  supabaseAnonKey: mustGet("VITE_SUPABASE_ANON_KEY"),

  // Stripe (public key; can be required if your app depends on it)
  // If your app should still build without Stripe configured, leave it optional.
  stripePk: get("VITE_STRIPE_PK") ?? get("VITE_STRIPE_PUBLISHABLE_KEY"),
};
