require('dotenv').config({ path: './frontend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('Checking admin_users table structure...');
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'admin_users' });
  
  if (error) {
    // If RPC fails, try a simple select to see keys
    console.log('RPC failed, trying select...');
    const { data: selectData, error: selectError } = await supabase.from('admin_users').select('*').limit(1);
    if (selectError) {
      console.error('Error:', selectError);
    } else {
      console.log('Table exists. Sample record keys:', selectData[0] ? Object.keys(selectData[0]) : 'No records');
    }
  } else {
    console.log('Table info:', data);
  }
}

check();
