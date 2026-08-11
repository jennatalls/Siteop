import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sdfdnxgxbxxbyofmeyzo.supabase.co';

// Provide a validly formatted JWT string as default so createClient never crashes at boot
const defaultDummyKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZmRneGd4Ynh4YnlvZm1leXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAyMDAwMDAwMH0.placeholder';

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || defaultDummyKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
      import.meta.env.VITE_SUPABASE_ANON_KEY !== defaultDummyKey
  );
};
