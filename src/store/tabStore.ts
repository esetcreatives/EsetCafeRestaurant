import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MenuItem {
  id: number;
  name: string;
  category: string;
  description: string;
  ingredients: string[];
  price: number;
  image_url: string;
  is_available: boolean;
  is_signature: boolean;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface Order {
  id: number;
  session_id: number;
  placed_at: string;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  items: any[];
}

interface TabState {
  tableId: number | null;
  tableNumber: number | null;
  token: string | null;
  sessionId: number | null;
  cartItems: CartItem[];
  confirmedOrders: Order[];
  splitSelections: Set<number>;
  
  // Actions
  setSession: (tableNumber: number, tableId: number, token: string, sessionId: number) => void;
  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: number) => void;
  updateQuantity: (itemId: number, quantity: number) => void;
  clearCart: () => void;
  addConfirmedOrder: (order: Order) => void;
  toggleSplitSelection: (itemId: number) => void;
  clearSplitSelections: () => void;
  getCartTotal: () => number;
  getSplitTotal: () => number;
  clearSession: () => void;
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tableId: null,
      tableNumber: null,
      token: null,
      sessionId: null,
      cartItems: [],
      confirmedOrders: [],
      splitSelections: new Set(),
      
      setSession: (tableNumber, tableId, token, sessionId) =>
        set({ tableNumber, tableId, token, sessionId }),
      
      addToCart: (item) =>
        set((state) => {
          const existing = state.cartItems.find((i) => i.id === item.id);
          if (existing) {
            return {
              cartItems: state.cartItems.map((i) =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { cartItems: [...state.cartItems, { ...item, quantity: 1 }] };
        }),
      
      removeFromCart: (itemId) =>
        set((state) => ({
          cartItems: state.cartItems.filter((i) => i.id !== itemId),
        })),
      
      updateQuantity: (itemId, quantity) =>
        set((state) => ({
          cartItems: state.cartItems.map((i) =>
            i.id === itemId ? { ...i, quantity } : i
          ),
        })),
      
      clearCart: () => set({ cartItems: [] }),
      
      addConfirmedOrder: (order) =>
        set((state) => ({
          confirmedOrders: [order, ...state.confirmedOrders],
        })),
      
      toggleSplitSelection: (itemId) =>
        set((state) => {
          const newSelections = new Set(state.splitSelections);
          if (newSelections.has(itemId)) {
            newSelections.delete(itemId);
          } else {
            newSelections.add(itemId);
          }
          return { splitSelections: newSelections };
        }),
      
      clearSplitSelections: () => set({ splitSelections: new Set() }),
      
      getCartTotal: () => {
        const { cartItems } = get();
        return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      },
      
      getSplitTotal: () => {
        const { cartItems, splitSelections } = get();
        return cartItems
          .filter((item) => splitSelections.has(item.id))
          .reduce((sum, item) => sum + item.price * item.quantity, 0);
      },
      
      clearSession: () =>
        set({
          tableId: null,
          tableNumber: null,
          token: null,
          sessionId: null,
          cartItems: [],
          confirmedOrders: [],
          splitSelections: new Set(),
        }),
    }),
    {
      name: 'eset-cafe-tab',
      partialize: (state) => ({
        tableId: state.tableId,
        tableNumber: state.tableNumber,
        token: state.token,
        sessionId: state.sessionId,
        cartItems: state.cartItems,
      }),
    }
  )
);
