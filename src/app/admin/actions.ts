'use server'

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

/**
 * Helper to verify that the request is coming from an authorized admin.
 * We check the user's role from the JWT stored in cookies.
 */
async function verifyAdmin(allowedRoles: string[] = ['admin', 'super_admin', 'manager', 'kitchen'], token?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  let user;
  if (token) {
    const { data: { user: u }, error } = await supabase.auth.getUser(token);
    if (error || !u) throw new Error('Unauthorized: Invalid or expired token');
    user = u;
  } else {
    // Fallback to cookies if no token provided (useful for future transitions)
    const { data: { user: u }, error } = await supabase.auth.getUser();
    if (error || !u) throw new Error('Unauthorized: No active session');
    user = u;
  }

  const role = user.user_metadata?.role || 'admin';
  if (!allowedRoles.includes(role)) {
    throw new Error(`Unauthorized: Role ${role} is not allowed to perform this action`);
  }

  return user;
}

/**
 * These actions use the Service Role Key to bypass RLS.
 * They are only executed on the server, keeping your secret key safe.
 */

export async function toggleMenuItemAvailability(id: number, isAvailable: boolean, token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager', 'kitchen'], token);
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

export async function deleteMenuItem(id: number, token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager'], token);
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

export async function saveMenuItem(itemData: any, id?: number, token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager'], token);
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

    if (result.error) {
      console.error('Supabase DB Error:', result.error);
      throw result.error;
    }
    
    console.log('DB Save Success for ID:', id || 'new');
    revalidatePath('/admin');
    revalidatePath('/menu');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Save Error:', error);
    return { error: error.message || 'Unknown server error' };
  }
}

export async function deleteTableAction(id: number, token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager'], token);
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
export async function createTableAction(number: number, token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager'], token);
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

export async function saveAdminAction(adminData: any, id?: string, token?: string) {
  try {
    await verifyAdmin(['super_admin', 'admin'], token);
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

export async function deleteAdminAction(id: string, token?: string) {
  try {
    await verifyAdmin(['super_admin', 'admin'], token);
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
// NOTE: This action is intentionally public — no admin auth required.
// Customers use this to join a table by entering its number manually.
export async function startManualSessionAction(tableNumber: number) {
  try {
    // Use supabaseAdmin (service role) to bypass RLS so guests can create sessions
    const { data: table, error: tableError } = await supabaseAdmin
      .from('tables')
      .select('id, token, status')
      .eq('number', tableNumber)
      .single();

    if (tableError || !table) {
      return { error: 'Table not found. Please check the table number and try again.' };
    }

    // Check for an existing open session on this table
    const { data: existingSession } = await supabaseAdmin
      .from('sessions')
      .select('id, status, token')
      .eq('table_id', table.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      return { 
        data: { 
          session_id: existingSession.id, 
          session_token: existingSession.token,
          table_id: table.id, 
          table_number: tableNumber, 
          token: table.token,
          message: 'Existing session found'
        }, 
        success: true 
      };
    }

    // Create a new session with a secure token
    const sessionToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const { data: newSession, error: createError } = await supabaseAdmin
      .from('sessions')
      .insert({ table_id: table.id, status: 'open', token: sessionToken })
      .select()
      .single();

    if (createError) throw createError;

    // Update table status to occupied
    await supabaseAdmin
      .from('tables')
      .update({ status: 'occupied' })
      .eq('id', table.id);

    return { 
      data: { 
        session_id: newSession.id, 
        session_token: sessionToken,
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
 
 export async function placeOrderAction(sessionId: number, items: any[], notes?: string, sessionToken: string = '') {
  try {
    const { data, error } = await supabaseAdmin.rpc('place_order', {
      p_session_id: sessionId,
      p_session_token: sessionToken,
      p_items: items,
      p_notes: notes || ''
    });

    if (error) throw error;
    if (!data.success) {
      // Pass back the specific error code for frontend handling
      return { 
        error: data.message || 'Failed to place order', 
        errorCode: data.error 
      };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Server Action Error (placeOrderAction):', error);
    return { error: error.message };
  }
}

export async function updateOrderStatus(orderId: number, status: string, token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager', 'kitchen'], token);
    const { error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (error) throw error;
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (updateOrderStatusAction):', error);
    return { error: error.message };
  }
}

export async function confirmPaymentAction(sessionId: number, paymentMethod: string = 'cash', token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager'], token);
    // 1. Get official totals from DB first
    const { data: billData, error: billError } = await supabaseAdmin.rpc('get_session_bill', {
      p_session_id: sessionId
    });

    if (billError) throw billError;

    // 2. Process payment with calculated totals
    const { data, error } = await supabaseAdmin.rpc('confirm_payment', {
      p_session_id: sessionId,
      p_payment_method: paymentMethod,
      p_total: billData.total // Ensure we use the server-calculated total
    });

    if (error) throw error;
    if (!data || !data.success) throw new Error(data?.error || 'Payment failed');

    // 3. Mark table as available
    await supabaseAdmin
      .from('tables')
      .update({ status: 'available' })
      .eq('id', data.table_id);

    revalidatePath('/admin');
    return { success: true, data: { total: billData.total } };
  } catch (error: any) {
    console.error('Server Action Error (confirmPaymentAction):', error);
    return { error: error.message };
  }
}

export async function cancelSessionAction(sessionId: number, token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager'], token);
    const { data: session, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('table_id')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) throw new Error('Session not found');

    // 1. Mark table as available
    await supabaseAdmin
      .from('tables')
      .update({ status: 'available' })
      .eq('id', session.table_id);

    // 2. Mark session as cancelled
    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({ 
        status: 'cancelled', 
        closed_at: new Date().toISOString() 
      })
      .eq('id', sessionId);

    if (updateError) throw updateError;

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (cancelSessionAction):', error);
    return { error: error.message };
  }
}

export async function resetDashboardData(token?: string) {
  try {
    await verifyAdmin(['super_admin', 'manager', 'admin'], token);
    // The order is important due to potential foreign key constraints
    // 1. Delete all payments
    const { error: pError } = await supabaseAdmin.from('payments').delete().neq('id', -1);
    if (pError) throw pError;
    
    // 2. Delete all order items
    const { error: oiError } = await supabaseAdmin.from('order_items').delete().neq('id', -1);
    if (oiError) throw oiError;
    
    // 3. Delete all orders
    const { error: oError } = await supabaseAdmin.from('orders').delete().neq('id', -1);
    if (oError) throw oError;
    
    // 4. Delete all sessions
    const { error: sError } = await supabaseAdmin.from('sessions').delete().neq('id', -1);
    if (sError) throw sError;
    
    // 5. Reset all tables to available
    const { error: tError } = await supabaseAdmin.from('tables').update({ status: 'available' }).neq('id', -1);
    if (tError) throw tError;

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (resetDashboardData):', error);
    return { error: error.message };
  }
}

export async function updatePaymentStatusAction(id: string, newStatus: 'approved' | 'rejected', reason?: string, token?: string) {
  try {
    await verifyAdmin(['admin', 'super_admin', 'manager'], token);
    
    const updateData: any = { status: newStatus };
    if (reason) {
      // Fetch current metadata to preserve it
      const { data: payment } = await supabaseAdmin
        .from('payments')
        .select('metadata')
        .eq('id', id)
        .single();
        
      updateData.metadata = { ...(payment?.metadata || {}), rejection_reason: reason };
    }

    const { error } = await supabaseAdmin
      .from('payments')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (updatePaymentStatusAction):', error);
    return { error: error.message };
  }
}
