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

function mustGet(name: string) {
  const v = (import.meta as any).env?.[name] as string | undefined;
  if (!v || !String(v).trim()) {
    throw new Error(
      `Missing environment variable ${name}. Set it in Cloudflare Pages (Production + Preview).`
    );
  }
  return v;
}

export const env = {
  supabaseUrl: normalizeSupabaseUrl(mustGet("VITE_SUPABASE_URL")),
  supabaseAnonKey: mustGet("VITE_SUPABASE_ANON_KEY"),
};
