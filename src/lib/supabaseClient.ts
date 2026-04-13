import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Custom Supabase client: reads VITE_PROD_BANCO_URL / VITE_PROD_BANCO_KEY first,
// falls back to the Lovable-managed defaults for local preview.
const SUPABASE_URL = "https://jtcaicvwlkldcalihmzv.supabase.co";

const SUPABASE_KEY = "sb_publishable_Y_y6MvSU76W7vdWsPqGITg_eynzE6UB";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
