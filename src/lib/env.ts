export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  stripePk: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string,
  priceMonthly: import.meta.env.VITE_STRIPE_PRICE_MONTHLY as string,
  priceAnnual: import.meta.env.VITE_STRIPE_PRICE_ANNUAL as string,
};
