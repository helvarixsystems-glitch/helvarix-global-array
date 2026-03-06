export function normalizeSupabaseUrl(url: string) {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (!trimmed.includes(".")) return `https://${trimmed}.supabase.co`;
  return `https://${trimmed}`;
}

function get(name: string) {
  return ((import.meta as any).env?.[name] as string | undefined)?.trim() || undefined;
}

function mustGet(name: string) {
  const v = get(name);
  if (!v) {
    throw new Error(
      `Missing environment variable ${name}. Set it in Cloudflare Pages for Preview and Production.`
    );
  }
  return v;
}

export const env = {
  supabaseUrl: normalizeSupabaseUrl(mustGet("VITE_SUPABASE_URL")),
  supabaseAnonKey: mustGet("VITE_SUPABASE_ANON_KEY"),
  stripePk: get("VITE_STRIPE_PK") ?? get("VITE_STRIPE_PUBLISHABLE_KEY") ?? "",
};

export function hasStripeClientKey() {
  return Boolean(env.stripePk);
}
