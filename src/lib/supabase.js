import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || '';
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export { supabaseUrl, supabaseAnon };


if (!supabaseUrl || !supabaseAnon) {
  console.warn('[Reef] Supabase env vars missing — check .env.local. Auth will not work.');
}

export const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnon || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // 'implicit' uses hash-based token flow — required for verifyOtp({ token_hash })
      // PKCE (default) generates a code_verifier that verifyOtp doesn't send, causing
      // "Email link is invalid or has expired" errors.
      flowType: 'implicit',
    },
  }
);
