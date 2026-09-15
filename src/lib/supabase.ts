import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase server-side (service role) para uso em API routes.
 * NUNCA importar este módulo em código que roda no browser — a service
 * role key tem acesso irrestrito e ignora RLS.
 */
let cachedClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidos (.env.local).'
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
