const { createClient } = require('@supabase/supabase-js');
// require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnose() {
  console.log('--- Diagnosing Database Permissions ---');

  // Check RLS policies for 'orders' table
  console.log('\nChecking RLS policies for "orders" table:');
  const { data: policies, error: policiesError } = await supabase
    .from('pg_policies')
    .select('*')
    .eq('tablename', 'orders');

  if (policiesError) {
    console.error('Error fetching policies:', policiesError);
  } else {
    console.log(JSON.stringify(policies, null, 2));
  }

  // Check if RLS is enabled on the table
  console.log('\nChecking if RLS is enabled for "orders":');
  const { data: tableInfo, error: tableError } = await supabase
    .rpc('get_table_info', { table_name: 'orders' });
  
  // If get_table_info RPC doesn't exist, use a direct SQL query via another RPC if possible, 
  // or just assume we might need to enable/fix it.
  
  // Let's try to list all tables and their RLS status
  const { data: rlsStatus, error: rlsError } = await supabase
    .rpc('exec_sql', { sql_query: `
      SELECT relname as table_name, relrowsecurity as rls_enabled 
      FROM pg_class c 
      JOIN pg_namespace n ON n.oid = c.relnamespace 
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND relname IN ('orders', 'order_items', 'sessions', 'tables');
    ` });

  if (rlsError) {
    console.error('Error checking RLS status (exec_sql might not exist):', rlsError);
  } else {
    console.log('RLS Status:', rlsStatus);
  }

  // Check place_order function definition
  console.log('\nChecking "place_order" function definition:');
  const { data: funcInfo, error: funcError } = await supabase
    .rpc('exec_sql', { sql_query: `
      SELECT routine_name, routine_type, external_language, routine_definition, security_type
      FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name = 'place_order';
    ` });

  if (funcError) {
    console.error('Error checking function definition:', funcError);
  } else {
    console.log(JSON.stringify(funcInfo, null, 2));
  }
}

diagnose();
