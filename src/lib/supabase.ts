import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawEnvUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Auto-resolve relative paths (e.g. /api/sb) to full domain URL so @supabase/supabase-js always gets an absolute http(s) URL
const rawUrl = rawEnvUrl.startsWith('/')
  ? `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}${rawEnvUrl}`
  : rawEnvUrl;

/**
 * Returns true if real Supabase backend URL and Anon Key are configured via environment variables.
 */
export function isBackendConfigured(): boolean {
  return Boolean(
    rawUrl &&
    rawKey &&
    !rawUrl.includes('placeholder') &&
    rawUrl.startsWith('http')
  );
}

// Fallback placeholder credentials to ensure createClient doesn't crash in offline/unconfigured environments
const resolvedUrl = isBackendConfigured() ? rawUrl : 'https://placeholder.supabase.co';
const resolvedKey = isBackendConfigured() ? rawKey : 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(resolvedUrl, resolvedKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
