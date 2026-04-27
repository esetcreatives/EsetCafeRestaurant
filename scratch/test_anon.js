const { createClient } = require('@supabase/supabase-js');
// require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAnonAccess() {
  console.log('--- Testing Anon Access ---');

  // Try to select from orders (should probably be allowed if they can see their own orders, or restricted)
  console.log('\nTesting SELECT from orders:');
  const { data: selectData, error: selectError } = await supabase
    .from('orders')
    .select('*')
    .limit(1);
  
  if (selectError) {
    console.error('SELECT Error:', selectError.message);
  } else {
    console.log('SELECT Success (might be empty):', selectData);
  }

  // Try to insert into orders (likely to fail if RLS is not set up correctly)
  console.log('\nTesting INSERT into orders:');
  const { data: insertData, error: insertError } = await supabase
    .from('orders')
    .insert({ session_id: 1, status: 'pending' }); // Dummy data
  
  if (insertError) {
    console.error('INSERT Error:', insertError.message);
  } else {
    console.log('INSERT Success:', insertData);
  }
}

testAnonAccess();
