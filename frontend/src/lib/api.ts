import { supabase } from './supabase';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

// Response types (kept from original)
export interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    username: string;
    full_name?: string | null;
    role: string;
  };
}

export interface SessionResponse {
  session_id: number;
  table_id: number;
  table_number: number;
  message: string;
}

export interface SessionDetail {
  id: number;
  table_id: number;
  table_number: number;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'paid' | 'cancelled';
  orders?: any[];
}

export interface OrderResponse {
  success: boolean;
  order: any;
  message: string;
}

export interface PaymentResponse {
  success: boolean;
  payment: {
    subtotal: number;
    vat: number;
    service_charge: number;
    total: number;
    payment_method: string;
  };
}

// Helper to handle Supabase responses
async function handleSupabase<T>(promise: PromiseLike<any>): Promise<ApiResponse<T>> {
  try {
    const { data, error } = await promise;
    if (error) {
      const isFetchError = error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError');
      
      // Better error formatting for console
      console.group('Supabase Operation Failed');
      console.error('Code:', error.code || 'N/A');
      console.error('Message:', error.message);
      
      if (!isFetchError) {
        try {
          // Check auth state to help debug RLS issues, but only if it's not a network error
          const { data: authData } = await supabase.auth.getSession();
          const session = authData?.session;
          console.log('Current Auth Role:', session?.user?.role || 'none (anonymous)');
          console.log('Current User Email:', session?.user?.email || 'N/A');
        } catch (e) {
          console.log('Could not retrieve session info');
        }
      } else {
        console.warn('Network error detected. Check your internet connection or Supabase URL configuration.');
      }
      
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
      console.error('Full Error:', error);
      console.groupEnd();
      
      return { error: error.message || 'Supabase request failed' };
    }
    return { data };
  } catch (error: any) {
    console.error('API Unexpected Error:', error);
    return { error: error.message || 'Unknown error' };
  }
}

// Menu API
export const menuAPI = {
  getAll: () => handleSupabase(supabase.from('menu_items').select('*').order('name')),
  getByCategory: (category: string) =>
    handleSupabase(supabase.from('menu_items').select('*').eq('category', category).order('name')),
  updateAvailability: (id: number, isAvailable: boolean) =>
    handleSupabase(supabase.from('menu_items').update({ is_available: isAvailable }).eq('id', id)),
  create: (item: any) =>
    handleSupabase(supabase.from('menu_items').insert(item)),
  update: (item: any) =>
    handleSupabase(supabase.from('menu_items').update(item).eq('id', item.id)),
  delete: (id: number) =>
    handleSupabase(supabase.from('menu_items').delete().eq('id', id)),
};

// Upload API
export const uploadAPI = {
  uploadImage: async (file: File): Promise<ApiResponse<{ url: string; filename: string }>> => {
    try {
      const filename = `${Date.now()}-${file.name.replace(/\s/g, '_')}`;
      const { data, error } = await supabase.storage
        .from('menu-images')
        .upload(filename, file);

      if (error) return { error: error.message };

      const { data: { publicUrl } } = supabase.storage
        .from('menu-images')
        .getPublicUrl(filename);

      return { data: { url: publicUrl, filename } };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  deleteImage: (filename: string) =>
    handleSupabase(supabase.storage.from('menu-images').remove([filename])),
};

// Session API
export const sessionAPI = {
  create: async (tableNumber: number, token: string): Promise<ApiResponse<SessionResponse>> => {
    try {
      // 1. Verify table and token
      const { data: table, error: tableError } = await supabase
        .from('tables')
        .select('id, number, token')
        .eq('number', tableNumber)
        .eq('token', token)
        .single();

      if (tableError || !table) return { error: 'Invalid table or token' };

      // 2. Check for existing open session
      const { data: existingSession } = await supabase
        .from('sessions')
        .select('id')
        .eq('table_id', table.id)
        .eq('status', 'open')
        .single();

      if (existingSession) {
        return {
          data: {
            session_id: existingSession.id,
            table_id: table.id,
            table_number: table.number,
            message: 'Session resumed'
          }
        };
      }

      // 3. Create new session
      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert({ table_id: table.id, status: 'open' })
        .select()
        .single();

      if (sessionError) return { error: sessionError.message };

      // 4. Update table status
      await supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id);

      return {
        data: {
          session_id: newSession.id,
          table_id: table.id,
          table_number: table.number,
          message: 'Session created'
        }
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  get: (sessionId: number): Promise<ApiResponse<SessionDetail>> =>
    handleSupabase(
      supabase.from('sessions')
        .select('*, tables(number)')
        .eq('id', sessionId)
        .single()
        .then((res: any) => {
          if (res.data) {
            res.data.table_number = res.data.tables?.number;
          }
          return res;
        })
    ),
};

// Order API
export const orderAPI = {
  place: async (sessionId: number, items: any[], notes?: string): Promise<ApiResponse<OrderResponse>> => {
    const { data, error } = await supabase.rpc('place_order', {
      p_session_id: sessionId,
      p_items: items,
      p_notes: notes || ''
    });

    if (error) return { error: error.message };
    if (!data.success) return { error: data.error };

    return { data: { success: true, order: data, message: 'Order placed successfully' } };
  },
  updateStatus: (orderId: number, status: string) =>
    handleSupabase(supabase.from('orders').update({ status }).eq('id', orderId)),
  getAll: (status?: string) => {
    let query = supabase.from('orders')
      .select('*, sessions(tables(number)), order_items(*, menu_items(name))')
      .order('placed_at', { ascending: false });

    if (status) query = query.eq('status', status);

    return handleSupabase(query.then((res: any) => {
      if (res.data) {
        // Flatten the response to match the expected format
        return {
          ...res,
          data: res.data.map((o: any) => ({
            ...o,
            table_number: o.sessions?.tables?.number,
            items: o.order_items.map((oi: any) => ({
              ...oi,
              name: oi.menu_items?.name
            }))
          }))
        };
      }
      return res;
    }));
  }
};

// Admin API
export const adminAPI = {
  login: async (username: string, password: string): Promise<ApiResponse<LoginResponse>> => {
    // Note: Supabase Auth requires an email. 
    // We automatically append @eset.com if a plain username is provided.
    const email = username.includes('@') ? username : `${username}@eset.com`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error: error.message };

    return {
      data: {
        success: true,
        token: data.session?.access_token || '',
        user: {
          id: data.user?.id || '',
          username: data.user?.email || '',
          full_name: data.user?.user_metadata?.full_name || 'Admin User',
          role: data.user?.user_metadata?.role || 'admin'
        }
      }
    };
  },
  logout: async () => {
    const { error } = await supabase.auth.signOut();
    return { error: error?.message };
  },
  getDashboard: async (date?: string) => {
    // Complex dashboard data - this could be multiple queries or a view
    const today = date || new Date().toISOString().split('T')[0];

    const [sales, orders, sessions] = await Promise.all([
      supabase.from('payments').select('total').gte('paid_at', today),
      supabase.from('orders').select('id', { count: 'exact' }).gte('placed_at', today),
      supabase.from('sessions').select('id', { count: 'exact' }).eq('status', 'open')
    ]);

    const totalSales = sales.data?.reduce((sum: number, p: any) => sum + Number(p.total), 0) || 0;

    return {
      data: {
        total_sales: totalSales,
        orders_count: orders.count || 0,
        active_sessions: sessions.count || 0,
        recent_orders: [] // Fetch separately if needed
      }
    };
  },
  confirmPayment: async (sessionId: number, paymentMethod: string = 'cash'): Promise<ApiResponse<PaymentResponse>> => {
    try {
      const { data, error } = await supabase.rpc('confirm_payment', {
        p_session_id: sessionId,
        p_payment_method: paymentMethod
      });

      if (error) return { error: error.message };
      if (!data || !data.success) return { error: data?.error || 'Payment failed' };

      return { data: { success: true, payment: { total: data.total } } as any };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  getReport: async (date?: string) => {
    const today = date || new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('payments').select('*').gte('paid_at', today);
    if (error) return { error: error.message };

    const total = data?.reduce((sum: number, p: any) => sum + Number(p.total), 0) || 0;
    return { data: { total_sales: total, count: data?.length || 0, items: data || [] } };
  },
  getAdminUsers: () =>
    handleSupabase(supabase.from('admin_users').select('*').then((res: any) => {
      if (res.data && res.data.length > 0) {
        console.log('ADMIN_USERS SCHEMA KEYS:', Object.keys(res.data[0]));
      }
      return res;
    })),
  createAdmin: (admin: any) => {
    // Mapping password to password_hash to satisfy database constraints
    const { password, ...rest } = admin;
    const data = { ...rest, password_hash: password };
    return handleSupabase(supabase.from('admin_users').insert(data));
  },
  updateAdmin: (id: string, admin: any) => {
    const { password, ...rest } = admin;
    const data: any = { ...rest };
    if (password) data.password_hash = password;
    return handleSupabase(supabase.from('admin_users').update(data).eq('id', id));
  },
  deleteAdmin: (id: string) =>
    handleSupabase(supabase.from('admin_users').delete().eq('id', id)),
  getSessions: () =>
    handleSupabase(supabase.from('sessions').select('*, tables(number)').order('opened_at', { ascending: false })),
  getTables: () =>
    handleSupabase(
      supabase.from('tables').select('*').order('number')
        .then((res: any) => {
          if (res.data) {
            res.data = res.data.map((t: any) => ({
              ...t,
              table_number: t.number,
              table_status: t.status
            }));
          }
          return res;
        })
    ),
  getSessionDetail: async (sessionId: number) => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, tables(number), orders(*, order_items(*, menu_items(name))), payments(*)')
      .eq('id', sessionId)
      .single();

    if (error) return { error: error.message };

    // Transform to match original format
    return {
      data: {
        ...data,
        table_number: data.tables?.number,
        orders: data.orders.map((o: any) => ({
          ...o,
          items: o.order_items.map((oi: any) => ({
            ...oi,
            name: oi.menu_items?.name
          }))
        }))
      }
    };
  },
  cancelSession: async (sessionId: number) => {
    const { data: session } = await supabase.from('sessions').select('table_id').eq('id', sessionId).single();
    if (session) {
      await supabase.from('tables').update({ status: 'available' }).eq('id', session.table_id);
    }
    return handleSupabase(supabase.from('sessions').update({ status: 'cancelled', closed_at: new Date().toISOString() }).eq('id', sessionId));
  },
  createTable: (number: number) =>
    handleSupabase(supabase.from('tables').insert({ number, token: `table_${number}_${Math.random().toString(36).substr(2, 9)}`, status: 'available' })),
  deleteTable: (id: number) =>
    handleSupabase(supabase.from('tables').delete().eq('id', id)),
};
