'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export function getSupabaseBrowserConfig() {
  const url = SUPABASE_URL;
  const key = SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY;

  return {
    url,
    key,
    isConfigured: Boolean(url && key),
  };
}

export function getSupabaseBrowserClient() {
  const { url, key, isConfigured } = getSupabaseBrowserConfig();

  if (!isConfigured || !url || !key) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return browserClient;
}
