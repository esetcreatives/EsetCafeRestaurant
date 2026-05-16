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

  // Fetch role from the database to ensure it is up to date and not relying on stale JWT metadata
  const { data: profile } = await supabaseAdmin.from('admin_users').select('role').eq('id', user.id).single();
  const role = profile?.role || user.user_metadata?.role || 'admin';

  if (!allowedRoles.includes(role)) {
    throw new Error(`Unauthorized: Role ${role} is not allowed to perform this action`);
  }

  return user;
}

async function logAdminAction(adminId: string, actionType: string, entityId: string, entityType: string, snapshot: any, reason?: string) {
  try {
    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: adminId,
      action_type: actionType,
      entity_id: entityId,
      entity_type: entityType,
      snapshot,
      reason
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

/**
 * These actions use the Service Role Key to bypass RLS.
 * They are only executed on the server, keeping your secret key safe.
 */

export async function toggleMenuItemAvailability(id: number, isAvailable: boolean, token?: string) {
  try {
    const user = await verifyAdmin(['admin', 'super_admin', 'manager', 'kitchen'], token);
    const { error } = await supabaseAdmin
      .from('menu_items')
      .update({ is_available: isAvailable })
      .eq('id', id);

    if (error) throw error;
    await logAdminAction(user.id, isAvailable ? 'ENABLE_MENU_ITEM' : 'DISABLE_MENU_ITEM', id.toString(), 'menu_item', { is_available: isAvailable });
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (toggleMenuItemAvailability):', error);
    return { error: error.message };
  }
}

export async function deleteMenuItem(id: number, token?: string) {
  try {
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);
    // Snapshot the item before deletion for the audit trail
    const { data: item } = await supabaseAdmin.from('menu_items').select('name, price, category').eq('id', id).single();
    const { error } = await supabaseAdmin
      .from('menu_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await logAdminAction(user.id, 'DELETE_MENU_ITEM', id.toString(), 'menu_item', item || { id }, 'Menu item deleted');
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (deleteMenuItem):', error);
    return { error: error.message };
  }
}

export async function saveMenuItem(itemData: any, id?: number, token?: string) {
  try {
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);
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
    
    const actionType = id ? 'UPDATE_MENU_ITEM' : 'CREATE_MENU_ITEM';
    await logAdminAction(user.id, actionType, (id || 'new').toString(), 'menu_item', { name: itemData.name, price: itemData.price, category: itemData.category });
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
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);
    const { data: table } = await supabaseAdmin.from('tables').select('number').eq('id', id).single();
    const { error } = await supabaseAdmin
      .from('tables')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await logAdminAction(user.id, 'DELETE_TABLE', id.toString(), 'table', { table_number: table?.number });
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (deleteTableAction):', error);
    return { error: error.message };
  }
}
export async function createTableAction(number: number, token?: string) {
  try {
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);
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
    await logAdminAction(user.id, 'CREATE_TABLE', data.id.toString(), 'table', { table_number: number });
    revalidatePath('/admin');
    return { data, success: true };
  } catch (error: any) {
    console.error('Server Action Error (createTableAction):', error);
    return { error: error.message };
  }
}

export async function saveAdminAction(adminData: any, id?: string, token?: string) {
  try {
    const user = await verifyAdmin(['super_admin', 'admin'], token);
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

    const actionType = id ? 'UPDATE_ADMIN_USER' : 'CREATE_ADMIN_USER';
    await logAdminAction(user.id, actionType, (authUserId || 'new').toString(), 'admin_user', { username: email, role, full_name });
    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (saveAdminAction):', error);
    return { error: error.message };
  }
}

export async function deleteAdminAction(id: string, token?: string) {
  try {
    const user = await verifyAdmin(['super_admin', 'admin'], token);
    const { data: target } = await supabaseAdmin.from('admin_users').select('username, role, full_name').eq('id', id).single();
    const { error } = await supabaseAdmin
      .from('admin_users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await logAdminAction(user.id, 'DELETE_ADMIN_USER', id, 'admin_user', target || { id }, 'Admin user deleted');
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
 
 export async function placeOrderAction(
  sessionId: number,
  items: any[],
  notes?: string,
  sessionToken: string = '',
  fulfillmentType: 'pay_first' | 'pay_later' = 'pay_later'
) {
  try {
    const { data, error } = await supabaseAdmin.rpc('place_order', {
      p_session_id: sessionId,
      p_session_token: sessionToken,
      p_items: items,
      p_notes: notes || '',
      p_fulfillment_type: fulfillmentType
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
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);
    // 1. Get official totals from DB first (now includes total_paid and remaining)
    const { data: billData, error: billError } = await supabaseAdmin.rpc('get_session_bill', {
      p_session_id: sessionId
    });

    if (billError) throw billError;

    // Use the remaining balance (accounts for prior partial payments)
    const amountToPay = billData.remaining || billData.total;
    const priorPaid = billData.total_paid || 0;

    // Proportionally split the remaining amount into subtotal/vat/service
    const ratio = billData.total > 0 ? amountToPay / billData.total : 1;
    const paymentSubtotal = billData.subtotal * ratio;
    const paymentVat = billData.vat * ratio;
    const paymentService = (billData.service_charge || billData.service || 0) * ratio;

    // 2. Process payment
    const { data: payment, error: pError } = await supabaseAdmin
      .from('payments')
      .insert({
        session_id: sessionId,
        subtotal: paymentSubtotal,
        vat: paymentVat,
        service_charge: paymentService,
        total: amountToPay,
        status: 'approved',
        payment_method: paymentMethod as any,
        transaction_code: `CASH-${Math.random().toString(36).substring(7).toUpperCase()}`
      })
      .select()
      .single();

    if (pError) {
      console.error('Manual payment insert failed:', pError);
      throw pError;
    }

    // 3. Update session accounting
    const newTotalPaid = priorPaid + amountToPay;
    const newRemaining = billData.total - newTotalPaid;

    if (newRemaining <= 0.01) {
      // Fully paid — close session and release table
      await supabaseAdmin
        .from('sessions')
        .update({ 
          status: 'closed', 
          closed_at: new Date().toISOString(),
          total_paid_amount: newTotalPaid
        })
        .eq('id', sessionId);

      // Reject any lingering pending payments
      await supabaseAdmin
        .from('payments')
        .update({ 
          status: 'rejected',
          metadata: { reason: 'Session was manually settled by administrator' }
        })
        .eq('session_id', sessionId)
        .in('status', ['pending', 'verified']);

      // Release table
      const { data: sessionData } = await supabaseAdmin
        .from('sessions')
        .select('table_id')
        .eq('id', sessionId)
        .single();

      if (sessionData) {
        await supabaseAdmin
          .from('tables')
          .update({ status: 'available' })
          .eq('id', sessionData.table_id);
      }
    } else {
      // Partial payment — keep session open with updated accounting
      await supabaseAdmin
        .from('sessions')
        .update({ total_paid_amount: newTotalPaid })
        .eq('id', sessionId);
    }

    await logAdminAction(
      user.id,
      'CONFIRM_PAYMENT',
      payment.id.toString(),
      'payment',
      { session_id: sessionId, amount: amountToPay, method: paymentMethod },
      'Manual payment confirmation'
    );

    revalidatePath('/admin');
    return { 
      success: true, 
      data: { 
        total: billData.total, 
        amount_paid: amountToPay,
        total_paid: newTotalPaid,
        remaining: Math.max(0, newRemaining),
        session_closed: newRemaining <= 0.01
      } 
    };
  } catch (error: any) {
    console.error('Server Action Error (confirmPaymentAction):', error);
    return { error: error.message };
  }
}

export async function cancelSessionAction(sessionId: number, token?: string, reason?: string) {
  try {
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);

    // Block cancellation if session has any approved payments
    const { data: approvedPayments } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'approved')
      .limit(1);
    
    if (approvedPayments && approvedPayments.length > 0) {
      throw new Error('Cannot cancel a session that has approved payments. Please process a refund instead.');
    }
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

    // 3. Mark all pending/preparing orders as cancelled so they leave the kitchen
    await supabaseAdmin
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('session_id', sessionId)
      .in('status', ['pending', 'preparing']);

    // 4. Reject any pending or verified payments for this session
    await supabaseAdmin
      .from('payments')
      .update({ 
        status: 'rejected',
        metadata: { reason: 'Session was cancelled by administrator' }
      })
      .eq('session_id', sessionId)
      .in('status', ['pending', 'verified']);

    await logAdminAction(
      user.id,
      'CANCEL_SESSION',
      sessionId.toString(),
      'session',
      { session_id: sessionId },
      reason || 'No reason provided'
    );

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (cancelSessionAction):', error);
    return { error: error.message };
  }
}

export async function resetDashboardData(token?: string) {
  try {
    const user = await verifyAdmin(['super_admin'], token);
    // The order is important due to potential foreign key constraints
    // 1. Delete all payments
    const { error: pError } = await supabaseAdmin.from('payments').delete().not('id', 'is', null);
    if (pError) throw pError;
    
    // 2. Delete all order items
    const { error: oiError } = await supabaseAdmin.from('order_items').delete().not('id', 'is', null);
    if (oiError) throw oiError;
    
    // 3. Delete all orders
    const { error: oError } = await supabaseAdmin.from('orders').delete().not('id', 'is', null);
    if (oError) throw oError;
    
    // 4. Delete all sessions
    const { error: sError } = await supabaseAdmin.from('sessions').delete().not('id', 'is', null);
    if (sError) throw sError;
    
    // 5. Reset all tables to available
    const { error: tError } = await supabaseAdmin.from('tables').update({ status: 'available' }).not('id', 'is', null);
    if (tError) throw tError;

    await logAdminAction(
      user.id,
      'RESET_DASHBOARD',
      'system',
      'system',
      { action: 'Cleared all payments, order_items, orders, and sessions' },
      'Full dashboard reset'
    );

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (resetDashboardData):', error);
    return { error: error.message };
  }
}

export async function updatePaymentStatusAction(id: string, newStatus: 'approved' | 'rejected', reason?: string, token?: string) {
  try {
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);
    
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
      .update({ ...updateData, payment_method: 'mobile' })
      .eq('id', id);

    if (error) throw error;

    // IF APPROVED: Auto-close the session only if remaining balance is zero
    if (newStatus === 'approved') {
      const { data: paymentData } = await supabaseAdmin
        .from('payments')
        .select('session_id, total')
        .eq('id', id)
        .single();

      if (paymentData?.session_id) {
        // Sync session bill
        const { data: billData, error: billError } = await supabaseAdmin.rpc('get_session_bill', {
          p_session_id: paymentData.session_id
        });

        if (!billError && billData) {
          const priorPaid = billData.total_paid || 0;
          // Note: The get_session_bill RPC calculation above might not include the 
          // newly approved payment yet if it depends on status='approved' and we JUST updated it.
          // Let's recalculate it to be safe.
          const { data: updatedBillData } = await supabaseAdmin.rpc('get_session_bill', {
            p_session_id: paymentData.session_id
          });

          if (updatedBillData && updatedBillData.remaining <= 0.01) {
            // 1. Mark session as closed
            await supabaseAdmin
              .from('sessions')
              .update({ 
                status: 'closed', 
                closed_at: new Date().toISOString() 
              })
              .eq('id', paymentData.session_id);

            // 2. Mark table as available
            const { data: sessionData } = await supabaseAdmin
              .from('sessions')
              .select('table_id')
              .eq('id', paymentData.session_id)
              .single();

            if (sessionData?.table_id) {
              await supabaseAdmin
                .from('tables')
                .update({ status: 'available' })
                .eq('id', sessionData.table_id);
            }
          }
        }
      }
    }
    
    await logAdminAction(
      user.id,
      newStatus === 'approved' ? 'APPROVE_PAYMENT' : 'REJECT_PAYMENT',
      id,
      'payment',
      { status: newStatus },
      reason || 'No reason provided'
    );

    revalidatePath('/admin');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (updatePaymentStatusAction):', error);
    return { error: error.message };
  }
}

/**
 * EMERGENCY: Close ALL open sessions at once.
 * Used when Wi-Fi / power goes out and the waiter needs to settle every table.
 * Returns a summary { closed, failed, exportedSnapshot }.
 */
export async function bulkCloseSessionsAction(reason: string, token?: string) {
  try {
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);

    // 1. Fetch all open sessions
    const { data: openSessions, error: fetchErr } = await supabaseAdmin
      .from('sessions')
      .select('id, table_id, opened_at')
      .eq('status', 'open');

    if (fetchErr) throw fetchErr;
    if (!openSessions || openSessions.length === 0) {
      return { success: true, closed: 0, failed: 0, exportedSnapshot: [] };
    }

    // 2. Build a snapshot for export before closing
    const snapshotRows: any[] = [];
    let closed = 0;
    let failed = 0;

    for (const session of openSessions) {
      try {
        // Get bill & orders for snapshot
        const [{ data: bill }, { data: orders }] = await Promise.all([
          supabaseAdmin.rpc('get_session_bill', { p_session_id: session.id }),
          supabaseAdmin
            .from('orders')
            .select('id, status, items:order_items(quantity, unit_price, name:menu_items(name))')
            .eq('session_id', session.id)
        ]);

        snapshotRows.push({
          session_id: session.id,
          table_id: session.table_id,
          opened_at: session.opened_at,
          closed_at: new Date().toISOString(),
          bill,
          orders,
        });

        // Close session
        await supabaseAdmin
          .from('sessions')
          .update({ status: 'cancelled', closed_at: new Date().toISOString() })
          .eq('id', session.id);

        // Cancel pending/preparing orders
        await supabaseAdmin
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('session_id', session.id)
          .in('status', ['pending', 'preparing']);

        // Release table
        await supabaseAdmin
          .from('tables')
          .update({ status: 'available' })
          .eq('id', session.table_id);

        // Reject lingering payments
        await supabaseAdmin
          .from('payments')
          .update({ status: 'rejected', metadata: { reason: 'Emergency bulk close: ' + reason } })
          .eq('session_id', session.id)
          .in('status', ['pending', 'verified']);

        closed++;
      } catch (err) {
        console.error(`Failed to close session ${session.id}:`, err);
        failed++;
      }
    }

    await logAdminAction(
      user.id,
      'BULK_CLOSE_SESSIONS',
      'system',
      'system',
      { closed, failed, session_ids: openSessions.map((s: any) => s.id) },
      reason
    );

    return { success: true, closed, failed, exportedSnapshot: snapshotRows };
  } catch (error: any) {
    console.error('Server Action Error (bulkCloseSessionsAction):', error);
    return { error: error.message };
  }
}

/**
 * Quick price update — manager can change a single item's price without
 * opening the full edit form. Revalidates both /admin and /menu.
 */
export async function updateMenuItemPriceAction(id: number, newPrice: number, token?: string) {
  try {
    const user = await verifyAdmin(['admin', 'super_admin', 'manager'], token);

    if (isNaN(newPrice) || newPrice <= 0) {
      throw new Error('Price must be a positive number.');
    }

    // Capture old price before update for the audit trail
    const { data: item } = await supabaseAdmin.from('menu_items').select('name, price').eq('id', id).single();
    const { error } = await supabaseAdmin
      .from('menu_items')
      .update({ price: newPrice })
      .eq('id', id);

    if (error) throw error;
    await logAdminAction(user.id, 'UPDATE_ITEM_PRICE', id.toString(), 'menu_item', { name: item?.name, old_price: item?.price, new_price: newPrice });

    revalidatePath('/admin');
    revalidatePath('/menu');
    return { success: true };
  } catch (error: any) {
    console.error('Server Action Error (updateMenuItemPriceAction):', error);
    return { error: error.message };
  }
}
