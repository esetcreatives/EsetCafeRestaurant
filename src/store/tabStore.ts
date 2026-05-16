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
  stock_quantity: number;
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface Order {
  id: number;
  session_id: number;
  placed_at: string;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  fulfillment_type?: 'pay_first' | 'pay_later';
  items: any[];
}

type PaymentMethodChoice = 'cash' | 'mobile';

interface TabState {
  tableId: number | null;
  tableNumber: number | null;
  token: string | null;
  sessionId: number | null;
  sessionToken: string | null;
  cartItems: CartItem[];
  confirmedOrders: Order[];
  splitSelections: Set<number>;

  // Hybrid Payment Model
  paymentMethod: PaymentMethodChoice;
  sessionTotalPaid: number;
  sessionAccumulatedBill: number;
  
  // Actions
  setSession: (tableNumber: number, tableId: number, token: string, sessionId: number, sessionToken: string) => void;
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

  // Hybrid Payment Actions
  setPaymentMethod: (method: PaymentMethodChoice) => void;
  updateSessionAccounting: (totalPaid: number, accumulatedBill: number) => void;
  getRemainingBalance: () => number;
  getCurrentOrderTotal: () => { subtotal: number; vat: number; service: number; total: number };
  getFulfillmentType: () => 'pay_first' | 'pay_later';
}

const VAT_RATE = 0.15;
const SERVICE_RATE = 0.10;

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tableId: null,
      tableNumber: null,
      token: null,
      sessionId: null,
      sessionToken: null,
      cartItems: [],
      confirmedOrders: [],
      splitSelections: new Set(),

      // Hybrid Payment Model defaults
      paymentMethod: 'cash',
      sessionTotalPaid: 0,
      sessionAccumulatedBill: 0,
      
      setSession: (tableNumber, tableId, token, sessionId, sessionToken) =>
        set({ tableNumber, tableId, token, sessionId, sessionToken }),
      
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
          sessionToken: null,
          cartItems: [],
          confirmedOrders: [],
          splitSelections: new Set(),
          paymentMethod: 'cash',
          sessionTotalPaid: 0,
          sessionAccumulatedBill: 0,
        }),

      // ── Hybrid Payment Actions ──────────────────────────────

      setPaymentMethod: (method) => set({ paymentMethod: method }),

      updateSessionAccounting: (totalPaid, accumulatedBill) =>
        set({ sessionTotalPaid: totalPaid, sessionAccumulatedBill: accumulatedBill }),

      /**
       * Returns the amount still owed for this session.
       * Formula: (session accumulated bill) - (total already paid)
       * For follow-up orders, this shows only what's NEW and unpaid.
       */
      getRemainingBalance: () => {
        const { sessionAccumulatedBill, sessionTotalPaid } = get();
        return Math.max(0, sessionAccumulatedBill - sessionTotalPaid);
      },

      /**
       * Calculate the current cart's total with tax/service
       * This is for the NEW order only (not the cumulative session).
       */
      getCurrentOrderTotal: () => {
        const { cartItems } = get();
        const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const vat = subtotal * VAT_RATE;
        const service = subtotal * SERVICE_RATE;
        const total = subtotal + vat + service;
        return { subtotal, vat, service, total };
      },

      /**
       * Derive fulfillment type from payment method selection.
       * Cash → pay_later, Mobile → pay_first
       */
      getFulfillmentType: () => {
        const { paymentMethod } = get();
        return paymentMethod === 'mobile' ? 'pay_first' : 'pay_later';
      },
    }),
    {
      name: 'eset-cafe-tab',
      partialize: (state) => ({
        tableId: state.tableId,
        tableNumber: state.tableNumber,
        token: state.token,
        sessionId: state.sessionId,
        sessionToken: state.sessionToken,
        cartItems: state.cartItems,
        paymentMethod: state.paymentMethod,
        sessionTotalPaid: state.sessionTotalPaid,
        sessionAccumulatedBill: state.sessionAccumulatedBill,
      }),
    }
  )
);
