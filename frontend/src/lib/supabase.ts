import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const isConfigured = 
  supabaseUrl && 
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  supabaseAnonKey &&
  supabaseAnonKey !== 'placeholder';

// Mock client if not configured to prevent crashes
const createMockBuilder = (msg: string) => {
  const builder: any = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => builder,
    gte: () => builder,
    lte: () => builder,
    then: (callback: any) => Promise.resolve({ data: null, error: { message: msg } }).then(callback),
  };
  return builder;
};

const mockClient = {
  from: () => createMockBuilder('Supabase not configured'),
  rpc: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  auth: {
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
    signOut: () => Promise.resolve({ error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  }
} as any;

if (typeof window !== 'undefined') {
  if (!isConfigured) {
    console.warn('⚠️ Supabase is NOT configured. Check your .env.local file.');
  } else {
    console.log('✅ Supabase initialized with URL:', supabaseUrl);
  }
}

export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : mockClient;
