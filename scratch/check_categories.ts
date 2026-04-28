
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkCategories() {
  const { data, error } = await supabase.from('menu_items').select('category');
  if (error) {
    console.error('Error fetching categories:', error);
    return;
  }
  const categories = [...new Set(data.map(item => item.category))];
  console.log('Unique categories in database:', categories);
}

checkCategories();
