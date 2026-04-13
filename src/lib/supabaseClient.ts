import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Prioriza VITE_PROD_BANCO_* (Vercel) → fallback para variáveis padrão do Lovable Cloud
const SUPABASE_URL =
  import.meta.env.VITE_PROD_BANCO_URL ||
  import.meta.env.VITE_SUPABASE_URL;

const SUPABASE_KEY =
  import.meta.env.VITE_PROD_BANCO_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
