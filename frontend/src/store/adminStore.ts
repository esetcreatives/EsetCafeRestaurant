import { create } from 'zustand';

interface AdminState {
  isAuthenticated: boolean;
  user: { id: string; username: string; full_name?: string | null; role: string } | null;
  orders: any[];
  sessions: any[];
  
  setAuth: (user: any, token: string) => void;
  logout: () => void;
  setOrders: (orders: any[]) => void;
  updateOrderStatus: (orderId: number, status: string) => void;
  setSessions: (sessions: any[]) => void;
  
  // Role helpers
  hasRole: (roles: string | string[]) => boolean;
  canAccessDashboard: () => boolean;
  canManageMenu: () => boolean;
  canDeleteMenu: () => boolean;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  orders: [],
  sessions: [],
  
  setAuth: (user, token) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    set({ isAuthenticated: true, user });
  },
  
  logout: () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    set({ isAuthenticated: false, user: null, orders: [], sessions: [] });
  },
  
  setOrders: (orders) => set({ orders }),
  
  updateOrderStatus: (orderId, status) =>
    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === orderId ? { ...order, status } : order
      ),
    })),
  
  setSessions: (sessions) => set({ sessions }),
  
  // Role helpers
  hasRole: (roles) => {
    const state = get();
    if (!state.user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(state.user.role);
  },
  
  canAccessDashboard: () => {
    const state = get();
    return state.user?.role === 'super_admin' || state.user?.role === 'manager' || state.user?.role === 'admin';
  },
  
  canManageMenu: () => {
    const state = get();
    return state.user?.role === 'super_admin' || state.user?.role === 'manager' || state.user?.role === 'admin';
  },
  
  canDeleteMenu: () => {
    const state = get();
    return state.user?.role === 'super_admin' || state.user?.role === 'admin';
  },
}));
