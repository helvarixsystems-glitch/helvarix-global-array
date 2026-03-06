// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },

  realtime: {
    params: {
      eventsPerSecond: 5,
    },
  },

  global: {
    headers: {
      "x-application-name": "helvarix-global-array",
    },
  },

  db: {
    schema: "public",
  },
});
