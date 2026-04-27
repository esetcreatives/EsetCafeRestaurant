'use server'

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';

/**
 * These actions use the Service Role Key to bypass RLS.
 * They are only executed on the server, keeping your secret key safe.
 */

export async function toggleMenuItemAvailability(id: number, isAvailable: boolean) {
  try {
    const { error } = await supabaseAdmin
      .from('menu_items')
      .update({ is_available: isAvailable })
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (toggleMenuItemAvailability):', error);
    return { error: error.message };
  }
}

export async function deleteMenuItem(id: number) {
  try {
    const { error } = await supabaseAdmin
      .from('menu_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (deleteMenuItem):', error);
    return { error: error.message };
  }
}

export async function saveMenuItem(itemData: any, id?: number) {
  try {
    let result;
    if (id) {
      result = await supabaseAdmin
        .from('menu_items')
        .update(itemData)
        .eq('id', id);
    } else {
      result = await supabaseAdmin
        .from('menu_items')
        .insert(itemData);
    }

    if (result.error) throw result.error;
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (saveMenuItem):', error);
    return { error: error.message };
  }
}

export async function deleteTableAction(id: number) {
  try {
    const { error } = await supabaseAdmin
      .from('tables')
      .delete()
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (deleteTableAction):', error);
    return { error: error.message };
  }
}
export async function createTableAction(number: number) {
  try {
    const { data, error } = await supabaseAdmin
      .from('tables')
      .insert({ 
        number, 
        token: `table_${number}_${Math.random().toString(36).substr(2, 9)}`, 
        status: 'available' 
      })
      .select()
      .single();

    if (error) throw error;
    revalidatePath('/admin');
    return { data, success: true };
  } catch (error: any) {
    console.error('Server Action Error (createTableAction):', error);
    return { error: error.message };
  }
}

export async function saveAdminAction(adminData: any, id?: string) {
  try {
    const { username, password, role, full_name } = adminData;
    const email = username.includes('@') ? username : `${username}@eset.com`;

    let authUserId = id;

    // 1. Create or Update the Supabase Auth User
    if (!id) {
      // For NEW admins
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, full_name }
      });

      if (authError) {
        // If user already exists in Auth but not in our table, we try to recover
        if (authError.message.includes('already registered')) {
          // You might want to handle this differently in production
          console.warn('User already exists in Auth, attempting to link to admin_users table.');
        } else {
          throw authError;
        }
      }
      authUserId = authData.user?.id;
    } else {
      // For EXISTING admins
      const updateData: any = {
        user_metadata: { role, full_name }
      };
      if (password) updateData.password = password;

      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(id, updateData);
      if (authUpdateError) throw authUpdateError;
    }

    // 2. Upsert into the public.admin_users table
    const dbData: any = {
      id: authUserId,
      username: email,
      full_name,
      role,
      password_hash: password // Still keeping this for compatibility, though Auth handles it
    };

    const { error: dbError } = await supabaseAdmin
      .from('admin_users')
      .upsert(dbData, { onConflict: 'id' });

    if (dbError) throw dbError;

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (saveAdminAction):', error);
    return { error: error.message };
  }
}

export async function deleteAdminAction(id: string) {
  try {
    const { error } = await supabaseAdmin
      .from('admin_users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (deleteAdminAction):', error);
    return { error: error.message };
  }
}
export async function startManualSessionAction(tableNumber: number) {
  try {
    const { data: table, error: tableError } = await supabaseAdmin
      .from('tables')
      .select('id, token, status')
      .eq('number', tableNumber)
      .single();

    if (tableError || !table) throw new Error('Table not found');

    const { data: existingSession } = await supabaseAdmin
      .from('sessions')
      .select('id, status')
      .eq('table_id', table.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      return { 
        data: { 
          session_id: existingSession.id, 
          table_id: table.id, 
          table_number: tableNumber, 
          token: table.token,
          message: 'Existing session found'
        }, 
        success: true 
      };
    }

    const { data: newSession, error: createError } = await supabaseAdmin
      .from('sessions')
      .insert({ table_id: table.id, status: 'open' })
      .select()
      .single();

    if (createError) throw createError;
 
     return { 
       data: { 
         session_id: newSession.id, 
         table_id: table.id, 
         table_number: tableNumber, 
         token: table.token,
         message: 'Session created'
       }, 
       success: true 
     };
   } catch (error: any) {
     console.error('Server Action Error (startManualSessionAction):', error);
     return { error: error.message };
   }
 }
 
 export async function placeOrderAction(sessionId: number, items: any[], notes?: string) {
   try {
     const { data, error } = await supabaseAdmin.rpc('place_order', {
       p_session_id: sessionId,
       p_items: items,
       p_notes: notes || ''
     });
 
     if (error) throw error;
     if (!data.success) throw new Error(data.error);
 
     return { success: true, data };
   } catch (error: any) {
     console.error('Server Action Error (placeOrderAction):', error);
     return { error: error.message };
   }
 }
