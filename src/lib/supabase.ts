import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Strips accidental whitespace and surrounding quotes/brackets/parentheses from environment variables.
 * Handles cases like `"https://..."`, `'https://...'`, `[https://...]`, `(https://...)`.
 */
export function sanitizeEnvValue(val: string | undefined | null): string {
  if (!val) return '';
  let s = String(val).trim();
  // Strip surrounding quotes: ", ', `
  s = s.replace(/^["'`]|["'`]$/g, '').trim();
  // Strip surrounding brackets / parentheses: (), [], {}, <>
  s = s.replace(/^[(\[{<]|[)\]}>]$/g, '').trim();
  // Strip any remaining surrounding quotes
  s = s.replace(/^["'`]|["'`]$/g, '').trim();
  return s;
}

const rawEnvUrl = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
const rawKey = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

/**
 * Resolves the Supabase URL:
 * - If VITE_SUPABASE_URL is a valid https:// (or http://) URL, use it directly in both dev and production.
 * - Only use /api/sb when VITE_SUPABASE_URL is unset or explicitly set to /api/sb.
 */
export const resolveSupabaseUrl = (envUrl = rawEnvUrl): string => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const clean = sanitizeEnvValue(envUrl);

  // If a valid http(s) URL, use it directly (do not force /api/sb)
  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }

  // Unset or explicitly set to /api/sb
  if (!clean || clean === '/api/sb') {
    return `${origin}/api/sb`;
  }

  // Other relative path
  if (clean.startsWith('/')) {
    return `${origin}${clean}`;
  }

  return clean;
};

const rawUrl = resolveSupabaseUrl();

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
