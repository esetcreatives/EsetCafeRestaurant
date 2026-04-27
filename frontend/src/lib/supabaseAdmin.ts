import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// This client bypasses RLS. ONLY use this in Server Actions or API routes.
// We check for the key to prevent crashing the app during build or if it's missing.
export const supabaseAdmin = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : new Proxy({} as any, {
      get: () => {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing in .env.local. Please add it to perform administrative actions.');
      }
    });