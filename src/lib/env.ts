// src/lib/env.ts

export function normalizeSupabaseUrl(url: string) {
  const trimmed = (url ?? "").trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed && !trimmed.includes(".")) return `https://${trimmed}.supabase.co`;
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

  // Stripe (required)
  // Use ONE of these names; VITE_STRIPE_PK is the recommended canonical name.
  stripePk: get("VITE_STRIPE_PK") ?? get("VITE_STRIPE_PUBLISHABLE_KEY") ?? mustGet("VITE_STRIPE_PK"),
};
