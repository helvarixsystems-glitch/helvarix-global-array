/**
 * Environment configuration loader
 * Prevents application crashes when optional keys (like Stripe) are missing.
 */

function requireEnv(name: string): string {
  const value = import.meta.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function optionalEnv(name: string): string | null {
  const value = import.meta.env[name]

  if (!value || value === "") {
    return null
  }

  return value
}

export const env = {
  /**
   * Supabase configuration
   */
  SUPABASE_URL: requireEnv("VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: requireEnv("VITE_SUPABASE_ANON_KEY"),

  /**
   * Stripe configuration
   * Optional so the app doesn't crash if not configured yet
   */
  STRIPE_PK: optionalEnv("VITE_STRIPE_PK"),

  /**
   * Application metadata
   */
  APP_NAME: "Helvarix Global Array"
}
