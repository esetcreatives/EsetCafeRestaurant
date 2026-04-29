'use client';

import { useEffect, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, X, Plus, Minus, Coffee, Search, ArrowRight, User, CheckCircle, ChefHat, Clock, Bell, Utensils, XCircle } from 'lucide-react';
import gsap from 'gsap';
import useSWR from 'swr';
import { useTabStore, MenuItem } from '@/store/tabStore';
import { menuAPI, sessionAPI, orderAPI, adminAPI } from '@/lib/api';
import { startManualSessionAction, placeOrderAction } from '@/app/admin/actions';
import { initiatePaymentAction } from './actions';
import { useAdminStore } from '@/store/adminStore';
import { CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';

function MenuContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState(true); // Always true now to allow browsing
  const [placingOrder, setPlacingOrder] = useState(false);
  const [settlingPayment, setSettlingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // Manual Table Selection State
  const [showTableModal, setShowTableModal] = useState(false);
  const [manualTableNumber, setManualTableNumber] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [isJoining, setIsJoining] = useState(!!(searchParams.get('table') && searchParams.get('token')));
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [taxSettings, setTaxSettings] = useState({ vat_rate: 0.15, service_charge_rate: 0.10 });
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [showTracker, setShowTracker] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const {
    sessionId,
    sessionToken,
    tableNumber,
    cartItems,
    setSession,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    clearSession,
  } = useTabStore();

  // Use SWR for robust, high-performance data fetching
  const { data: rawMenu, error: menuError, isLoading: menuLoading } = useSWR(
    'menu-items',
    async () => {
      const { data, error } = await menuAPI.getAll();
      if (error) throw new Error(error);
      return data;
    },
    {
      refreshInterval: 15000, // Refresh every 15s in background
      revalidateOnFocus: true,
      dedupingInterval: 2000
    }
  );

  // Normalize and memoize menu items
  const menuItems = useMemo(() => {
    if (!rawMenu || !Array.isArray(rawMenu)) return [];
    return rawMenu.map(item => ({
      ...item,
      price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
    }));
  }, [rawMenu]);

  // Fetch unique categories from DB dynamically
  const categories = useMemo(() => {
    const hardcoded = [
      { id: 'appetizers', label: 'Appetizers' },
      { id: 'mains', label: 'Mains' },
      { id: 'sides', label: 'Sides' },
      { id: 'desserts', label: 'Desserts' },
      { id: 'beverages', label: 'Beverages' },
    ];
    
    const dbCats = menuItems ? Array.from(new Set(menuItems.map(item => item.category))) : [];
    const otherCats = dbCats
      .filter(cat => !hardcoded.find(h => h.id === cat))
      .filter(Boolean);

    return [
      { id: 'all', label: 'All Categories' },
      ...hardcoded,
      ...otherCats.map(cat => ({ id: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1) }))
    ];
  }, [menuItems]);

  useEffect(() => {
    const urlTableNumber = searchParams.get('table');
    const urlToken = searchParams.get('token');

    if (urlTableNumber && urlToken) {
      // QR Code mode: clear any stale session, then join the scanned table
      const urlTableNum = parseInt(urlTableNumber);

      // If we already have a session for this exact table, skip re-creation
      const currentTableNum = useTabStore.getState().tableNumber;
      if (currentTableNum !== urlTableNum) {
        // Different table (or no session) – clear stale data first
        clearCart();
      }

      sessionAPI.create(urlTableNum, urlToken).then(({ data, error }) => {
        if (data && !error) {
          setSession(data.table_number, data.table_id, urlToken, data.session_id, data.session_token);
          if (data.message === 'Session created') {
            clearCart();
          }
        } else {
          console.error('QR session error:', error);
          setToast({ 
            message: 'QR code might be expired. Please join the table manually.', 
            type: 'error' 
          });
        }
        setIsJoining(false);
      });
    } else {
      setIsJoining(false);
    }

    // Fetch tax settings from DB
    adminAPI.getAppSettings().then((res: any) => {
      const data = res.data;
      if (data && Array.isArray(data)) {
        const vat = data.find((s: any) => s.key === 'vat_rate')?.value;
        const svc = data.find((s: any) => s.key === 'service_charge_rate')?.value;
        setTaxSettings({
          vat_rate: vat !== undefined ? Number(vat) : 0.15,
          service_charge_rate: svc !== undefined ? Number(svc) : 0.10
        });
      }
    });
  }, [searchParams]);

  // Handle Order Real-time Tracking
  useEffect(() => {
    if (!sessionId) return;

    // 1. Initial fetch
    const fetchOrders = async () => {
      const { data } = await orderAPI.getSessionOrders(sessionId);
      if (data && Array.isArray(data)) setActiveOrders(data);
    };
    fetchOrders();

    // 2. Subscribe to changes
    const channel = orderAPI.subscribeToOrders(sessionId, (payload) => {
      console.log('Order Change Received:', payload);
      fetchOrders(); // Re-fetch on any change for simplicity/reliability
      
      // If an order became 'ready' or 'served', show tracker
      if (payload.new && ['ready', 'served'].includes(payload.new.status) && !['ready', 'served'].includes(payload.old?.status)) {
        setShowTracker(true);
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId]);

  // Initial animation
  useEffect(() => {
    if (!menuLoading && menuItems.length > 0) {
      const timer = setTimeout(() => {
        const cards = document.querySelectorAll('.menu-card');
        if (cards.length > 0) {
          gsap.fromTo(cards, 
            { opacity: 0, y: 30, scale: 0.95 }, 
            { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.08, ease: 'power4.out', clearProps: 'transform' }
          );
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [menuLoading, menuItems.length]);

  const handleStartManualSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const tableNum = parseInt(manualTableNumber);
    if (isNaN(tableNum) || tableNum <= 0) {
      setToast({ message: 'Please enter a valid table number.', type: 'error' });
      return;
    }

    setManualLoading(true);
    try {
      const result = await startManualSessionAction(tableNum);
      if (result.success && result.data) {
        const { session_id, table_id, token, table_number, session_token } = result.data;
        // Close modal first so UI updates correctly
        setShowTableModal(false);
        setManualTableNumber('');
        // Set session in store
        setSession(table_number, table_id, token, session_id, session_token);
        
        // If they were trying to add an item, add it immediately after session is set
        if (pendingItem) {
          const item = pendingItem;
          setPendingItem(null);
          addToCart({ ...item, price: typeof item.price === 'string' ? parseFloat(item.price as any) : item.price });
          gsap.fromTo('.cart-btn', { scale: 1 }, { scale: 1.1, duration: 0.15, yoyo: true, repeat: 1 });
          // Open the cart modal immediately so user doesn't have to click the button
          setShowCart(true);
        }
      } else {
        setToast({ message: result.error || 'Failed to find table.', type: 'error' });
      }
    } finally {
      setManualLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchesCategory = selectedCategory === 'all' 
        ? true 
        : item.category === selectedCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch && item.is_available;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  const handleAddToCart = (item: MenuItem) => {
    if (!sessionId) {
      setPendingItem(item);
      setShowTableModal(true);
      return;
    }
    addToCart({ ...item, price: typeof item.price === 'string' ? parseFloat(item.price) : item.price });
    gsap.fromTo('.cart-btn', { scale: 1 }, { scale: 1.1, duration: 0.15, yoyo: true, repeat: 1 });
  };

  const handlePlaceOrder = async () => {
    if (!sessionId || cartItems.length === 0 || placingOrder) return;
    
    setPlacingOrder(true);
    
    try {
      const { data: sessionData, error: sessionError } = await sessionAPI.get(sessionId);
      
      if (sessionError || !sessionData || sessionData.status !== 'open') {
        setToast({ message: 'Your session has expired. Please join again.', type: 'error' });
        clearCart();
        setShowCart(false);
        window.location.href = '/menu';
        return;
      }
      
      const items = cartItems.map(item => ({ menu_item_id: item.id, quantity: item.quantity }));
      const result = await placeOrderAction(sessionId, items, '', sessionToken || '');
      
      if (result.success) {
        // Success notification handled by state/subscription
        clearCart();
        setShowCart(false);
        setShowTracker(true);
        setToast({ message: 'Order sent to the kitchen!', type: 'success' });
      } else {
        const error = result.error;
        const errorCode = (result as any).errorCode;

        if (errorCode === 'RATE_LIMITED') {
          setToast({ message: 'Too many orders! Please wait a bit.', type: 'error' });
        } else if (errorCode === 'OUT_OF_STOCK') {
          setToast({ message: `Out of stock: ${error}`, type: 'error' });
        } else if (error?.includes('closed') || error?.includes('paid') || errorCode === 'SESSION_CLOSED') {
          setToast({ message: 'Session expired. Please join again.', type: 'error' });
          clearCart();
          setShowCart(false);
          window.location.href = '/menu';
        } else {
          setToast({ message: 'Failed to place order: ' + (error || 'Unknown error'), type: 'error' });
        }
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleSettleBill = async () => {
    if (!sessionId) return;
    setSettlingPayment(true);
    setPaymentError(null);
    try {
      const result = await initiatePaymentAction(sessionId);
      if (result.success) {
        // Redirect to a specialized payment instruction page
        router.push(`/checkout/status?id=${result.paymentId}&init=true`);
      } else {
        setPaymentError(result.error || 'Failed to initiate payment');
      }
    } catch (err: any) {
      setPaymentError(err.message || 'An unexpected error occurred');
    } finally {
      setSettlingPayment(false);
    }
  };

  const subtotal = getCartTotal();
  const vat = subtotal * taxSettings.vat_rate;
  const service = subtotal * taxSettings.service_charge_rate;
  const total = subtotal + vat + service;


  return (
    <div style={{ minHeight: '100svh', background: '#F9F9F9', paddingBottom: '8rem', fontFamily: 'var(--font-instrument), system-ui, sans-serif' }}>
      {/* Ambient glows */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(253,202,0,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(5,80,60,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(249,249,249,0.88)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(5,80,60,0.07)', padding: '1.1rem 1.5rem',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <h1 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-0.04em', color: '#05503c' }}>
                ESET <span style={{ color: '#fdca00' }}>Cafe</span>
              </h1>
            </Link>
            <div style={{ width: 1, height: 24, background: 'rgba(5,80,60,0.1)' }} />
            {sessionId ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.6rem',
                background: 'rgba(253,202,0,0.08)',
                border: '1px solid rgba(253,202,0,0.2)',
                borderRadius: '10px',
                padding: '0.35rem 0.7rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Utensils size={13} color="#fdca00" />
                  <span style={{ 
                    fontSize: '0.65rem', 
                    fontFamily: 'var(--font-bricolage)', 
                    fontWeight: 800, 
                    color: '#05503c',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Table {tableNumber}
                  </span>
                </div>
                <div style={{ width: 1, height: 12, background: 'rgba(5,80,60,0.1)' }} />
                <button 
                  onClick={() => {
                    if (confirm('Leave this table? Your current cart will be cleared.')) {
                      clearSession();
                      window.location.href = '/menu';
                    }
                  }}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: 'rgba(5,80,60,0.4)', 
                    fontSize: '0.6rem', 
                    fontWeight: 800, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em', 
                    cursor: 'pointer',
                    padding: '0',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(5,80,60,0.4)'}
                >
                  Leave
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowTableModal(true)}
                style={{
                  background: 'rgba(5,80,60,0.05)', border: '1px solid rgba(5,80,60,0.1)',
                  borderRadius: '10px', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  cursor: 'pointer', fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.65rem',
                  color: '#05503c', textTransform: 'uppercase', letterSpacing: '0.05em'
                }}
              >
                <User size={14} /> Join Table
              </button>
            )}
          </div>

          <button
            onClick={() => setShowCart(true)}
            className="cart-btn"
            style={{
              position: 'relative', width: 44, height: 44, borderRadius: 14,
              background: '#05503c', border: 'none', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 8px 20px rgba(5,80,60,0.2)',
            }}
          >
            <ShoppingCart size={20} strokeWidth={2.5} />
            {cartItems.length > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                background: '#fdca00', color: '#05503c',
                width: 22, height: 22, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 900, border: '3px solid #F9F9F9'
              }}>
                {cartItems.reduce((sum, i) => sum + i.quantity, 0)}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Hero / Categories */}
      <div style={{ padding: '2rem 1.5rem 0', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ background: '#ffffff', borderRadius: 32, padding: '2.5rem 2rem', border: '1px solid rgba(5,80,60,0.05)', boxShadow: '0 10px 40px rgba(5,80,60,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#fdca00', marginBottom: '0.5rem' }}>Menu</p>
              <h2 style={{ fontFamily: 'var(--font-bricolage)', fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#05503c', lineHeight: 1.1 }}>
                Discover our <br /> Culinary Delights
              </h2>
            </div>
            
            <div style={{ position: 'relative', minWidth: 'min(100%, 320px)', flex: '1 1 280px' }}>
              <Search style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(5,80,60,0.3)', pointerEvents: 'none', zIndex: 1 }} size={18} />
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '1rem 1.25rem 1rem 3.25rem', borderRadius: 20,
                  border: '1.5px solid rgba(5,80,60,0.1)',
                  background: '#ffffff', color: '#05503c', fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                  outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#fdca00'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(253,202,0,0.1)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(5,80,60,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
          </div>

          {/* Category Filter Buttons */}
          <div style={{ 
            display: 'flex', 
            overflowX: 'auto', 
            gap: '0.6rem', 
            padding: '0.5rem 0',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            justifyContent: 'flex-start',
          }}>
            <style>{`
              div::-webkit-scrollbar { display: none; }
            `}</style>
            {categories.map((cat: any) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '999px',
                    border: '1.5px solid',
                    borderColor: isActive ? '#fdca00' : 'rgba(5,80,60,0.1)',
                    background: isActive ? '#fdca00' : '#ffffff',
                    color: '#05503c',
                    fontFamily: 'var(--font-bricolage)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isActive ? '0 4px 15px rgba(253,202,0,0.25)' : 'none',
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Menu grid */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1rem 0.75rem', position: 'relative', zIndex: 1 }}>
        {menuLoading && menuItems.length === 0 ? (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))', 
            gap: '0.75rem' 
          }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ height: 280, borderRadius: 20, background: 'rgba(5,80,60,0.03)', animation: 'pulse 1.5s infinite ease-in-out' }} />
            ))}
            <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <Coffee size={48} style={{ color: 'rgba(5,80,60,0.1)', margin: '0 auto 1rem' }} />
            <p style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.2rem', color: '#05503c' }}>No items found</p>
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))', 
            gap: '0.75rem' 
          }}>
            {filteredItems.map(item => (
              <div
                key={item.id}
                className="menu-card"
                onClick={() => setSelectedItem(item)}
                style={{
                  background: '#ffffff', borderRadius: 20, overflow: 'hidden',
                  border: '1px solid rgba(5,80,60,0.06)',
                  boxShadow: '0 4px 20px rgba(5,80,60,0.03)',
                  transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ position: 'relative', height: 140, overflow: 'hidden' }}>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'rgba(5,80,60,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Coffee size={48} style={{ color: 'rgba(5,80,60,0.1)' }} />
                    </div>
                  )}
                  {/* Category tag */}
                  <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 2, display: 'flex', gap: '0.5rem' }}>
                    <span style={{
                      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                      border: '1px solid rgba(5,80,60,0.1)', borderRadius: '9999px', padding: '0.25rem 0.75rem',
                      fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.7rem', color: '#05503c', letterSpacing: '0.02em',
                    }}>
                      {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                    </span>
                    {item.stock_quantity <= 5 && item.stock_quantity > 0 && (
                      <span style={{
                        background: 'rgba(253,202,0,0.92)', backdropFilter: 'blur(8px)',
                        borderRadius: '9999px', padding: '0.25rem 0.75rem',
                        fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.7rem', color: '#05503c',
                      }}>
                        Low Stock: {item.stock_quantity}
                      </span>
                    )}
                    {item.stock_quantity <= 0 && (
                      <span style={{
                        background: 'rgba(239,68,68,0.92)', backdropFilter: 'blur(8px)',
                        borderRadius: '9999px', padding: '0.25rem 0.75rem',
                        fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.7rem', color: '#ffffff',
                      }}>
                        Out of Stock
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ padding: '0.75rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem', gap: '0.4rem' }}>
                    <h3 style={{ 
                      fontFamily: 'var(--font-bricolage)', 
                      fontWeight: 800, 
                      fontSize: '0.9rem', 
                      color: '#05503c', 
                      letterSpacing: '-0.01em',
                      lineHeight: 1.2,
                      flex: 1
                    }}>
                      {item.name}
                    </h3>
                    <p style={{ 
                      fontFamily: 'var(--font-bricolage)', 
                      fontWeight: 800, 
                      color: '#fdca00', 
                      fontSize: '0.9rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {Number(item.price).toFixed(0)} <span style={{ fontSize: '0.55rem' }}>ETB</span>
                    </p>
                  </div>
                  
                  {/* Hide description on mobile to keep it compact */}
                  <p style={{ 
                    fontSize: '0.7rem', 
                    color: 'rgba(5,80,60,0.5)', 
                    lineHeight: 1.4, 
                    marginBottom: '0.75rem', 
                    height: '2rem', 
                    overflow: 'hidden', 
                    display: '-webkit-box', 
                    WebkitLineClamp: 2, 
                    WebkitBoxOrient: 'vertical' 
                  }}>
                    {item.description}
                  </p>
                  
                  <div style={{ marginTop: 'auto' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.stock_quantity > 0 && !isJoining) handleAddToCart(item);
                      }}
                      disabled={item.stock_quantity <= 0 || isJoining}
                      className="btn-primary shimmer-btn"
                      style={{ 
                        width: '100%', 
                        padding: '0.5rem',
                        fontSize: '0.7rem',
                        display: 'flex', 
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.3rem',
                        opacity: (item.stock_quantity <= 0 || isJoining) ? 0.5 : 1,
                        cursor: (item.stock_quantity <= 0 || isJoining) ? 'not-allowed' : 'pointer',
                        background: (item.stock_quantity <= 0 || isJoining) ? 'rgba(5,80,60,0.1)' : undefined,
                        color: (item.stock_quantity <= 0 || isJoining) ? 'rgba(5,80,60,0.4)' : undefined,
                        borderRadius: '12px'
                      }}
                    >
                      <Plus size={12} /> {isJoining ? '...' : item.stock_quantity <= 0 ? 'Sold Out' : 'Order'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart Modal */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,80,60,0.2)', backdropFilter: 'blur(8px)' }} onClick={() => setShowCart(false)} />
          <div style={{
            position: 'relative', width: 'min(100%, 480px)', height: '100%', background: '#F9F9F9',
            boxShadow: '-10px 0 60px rgba(5,80,60,0.1)', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ padding: '2rem', borderBottom: '1px solid rgba(5,80,60,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.5rem', color: '#05503c' }}>Your Order</h2>
              <button onClick={() => setShowCart(false)} style={{ background: 'rgba(5,80,60,0.05)', border: 'none', width: 40, height: 40, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#05503c' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
              {cartItems.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
                  <ShoppingCart size={48} style={{ color: 'rgba(5,80,60,0.05)', marginBottom: '1.5rem' }} />
                  <p style={{ color: 'rgba(5,80,60,0.4)', fontWeight: 500 }}>Your cart is empty</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {cartItems.map(item => (
                    <div key={item.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ width: 70, height: 70, borderRadius: 16, overflow: 'hidden', background: 'rgba(5,80,60,0.05)', flexShrink: 0 }}>
                        {item.image_url ? <img src={item.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Coffee size={24} style={{ color: 'rgba(5,80,60,0.1)' }} /></div>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 800, color: '#05503c', fontSize: '0.95rem' }}>{item.name}</p>
                        <p style={{ fontSize: '0.85rem', color: '#fdca00', fontWeight: 800 }}>{Number(item.price).toFixed(0)} ETB</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fff', padding: '0.4rem', borderRadius: '12px', border: '1px solid rgba(5,80,60,0.07)' }}>
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)} style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'rgba(5,80,60,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#05503c' }}><Minus size={14} /></button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, minWidth: '1.2rem', textAlign: 'center' }}>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)} style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'rgba(5,80,60,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#05503c' }}><Plus size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cartItems.length > 0 && (
              <div style={{ padding: '2rem', background: '#fff', borderTop: '1px solid rgba(5,80,60,0.07)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(5,80,60,0.5)', fontSize: '0.9rem' }}>
                    <span>Subtotal</span>
                    <span>{subtotal.toFixed(0)} ETB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(5,80,60,0.5)', fontSize: '0.9rem' }}>
                    <span>VAT (15%)</span>
                    <span>{vat.toFixed(0)} ETB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(5,80,60,0.5)', fontSize: '0.9rem' }}>
                    <span>Service Charge (10%)</span>
                    <span>{service.toFixed(0)} ETB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.2rem', color: '#05503c', marginTop: '0.4rem', paddingTop: '1rem', borderTop: '1px dashed rgba(5,80,60,0.1)' }}>
                    <span>Total</span>
                    <span style={{ color: '#fdca00' }}>{total.toFixed(0)} ETB</span>
                  </div>
                </div>
                <button
                  onClick={handlePlaceOrder}
                  disabled={placingOrder}
                  className="btn-primary shimmer-btn"
                  style={{ width: '100%', padding: '1.2rem', borderRadius: 20, fontSize: '1rem' }}
                >
                  {placingOrder ? 'Sending to Kitchen...' : 'Confirm Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Table Modal */}
      {showTableModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,80,60,0.3)', backdropFilter: 'blur(10px)' }} onClick={() => setShowTableModal(false)} />
          <div style={{ position: 'relative', width: 'min(100%, 400px)', background: '#fff', borderRadius: 32, padding: '2.5rem', textAlign: 'center', boxShadow: '0 20px 60px rgba(5,80,60,0.15)' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(253,202,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fdca00', margin: '0 auto 1.5rem' }}>
              <User size={32} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.5rem', fontWeight: 800, color: '#05503c', marginBottom: '0.75rem' }}>Join a Table</h3>
            <p style={{ fontSize: '0.9rem', color: 'rgba(5,80,60,0.5)', marginBottom: '2rem' }}>Please enter your table number to start ordering.</p>
            
            <form onSubmit={handleStartManualSession}>
              <input
                type="number"
                placeholder="Table Number (e.g. 5)"
                value={manualTableNumber}
                onChange={e => setManualTableNumber(e.target.value)}
                autoFocus
                style={{
                  width: '100%', padding: '1.1rem', borderRadius: 16,
                  border: '1.5px solid rgba(5,80,60,0.1)',
                  fontSize: '1.2rem', fontWeight: 800, textAlign: 'center',
                  fontFamily: 'var(--font-bricolage)', color: '#05503c',
                  outline: 'none', marginBottom: '1.5rem'
                }}
              />
              <button
                type="submit"
                disabled={manualLoading || !manualTableNumber}
                className="btn-primary shimmer-btn"
                style={{ width: '100%', padding: '1.1rem', borderRadius: 16 }}
              >
                {manualLoading ? 'Joining...' : 'Start Ordering'}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Order Tracker Floating Toggle */}
      {activeOrders.length > 0 && !showTracker && (
        <button
          onClick={() => setShowTracker(true)}
          style={{
            position: 'fixed', bottom: '2rem', left: '1.5rem', zIndex: 90,
            background: '#ffffff', border: '1px solid rgba(5,80,60,0.1)',
            borderRadius: '9999px', padding: '0.75rem 1.25rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            boxShadow: '0 10px 40px rgba(5,80,60,0.1)',
            cursor: 'pointer', fontFamily: 'var(--font-bricolage)', fontWeight: 800,
            color: '#05503c', fontSize: '0.85rem'
          }}
        >
          <div style={{ position: 'relative' }}>
            <Bell size={18} style={{ color: '#fdca00' }} />
            {activeOrders.some(o => o.status === 'ready') && (
              <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: '#ef4444', borderRadius: '50%' }} />
            )}
          </div>
          Track Order
        </button>
      )}

      {/* Order Tracker Modal/Panel */}
      {showTracker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,80,60,0.15)', backdropFilter: 'blur(8px)' }} onClick={() => setShowTracker(false)} />
          <div style={{
            position: 'relative', width: 'min(100%, 600px)', maxHeight: '80vh',
            background: '#F9F9F9', borderRadius: '32px 32px 0 0',
            boxShadow: '0 -10px 60px rgba(5,80,60,0.15)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }}>
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(5,80,60,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(253,202,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fdca00' }}>
                  <Clock size={20} />
                </div>
                <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.25rem', color: '#05503c' }}>Order Progress</h2>
              </div>
              <button onClick={() => setShowTracker(false)} style={{ background: 'rgba(5,80,60,0.05)', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#05503c' }}><X size={18} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {activeOrders.map((order) => {
                  const isServed = order.status === 'served';
                  const isReady = order.status === 'ready' || isServed;
                  const isPreparing = order.status === 'preparing' || isReady;

                  return (
                    <div key={order.id} style={{
                      background: '#fff', borderRadius: 24, padding: '1.5rem',
                      border: isReady ? '2px solid #fdca00' : '1px solid rgba(5,80,60,0.06)',
                      boxShadow: isReady ? '0 10px 30px rgba(253,202,0,0.15)' : 'none'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                          <p style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'rgba(5,80,60,0.3)', letterSpacing: '0.1em' }}>Order #{order.id.toString().slice(-4)}</p>
                          <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.1rem', color: '#05503c' }}>
                            {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                          </p>
                        </div>
                        <div style={{
                          padding: '0.4rem 0.8rem', borderRadius: 10,
                          background: isServed ? 'rgba(34,197,94,0.1)' : isReady ? '#fdca00' : isPreparing ? 'rgba(5,80,60,0.1)' : 'rgba(5,80,60,0.05)',
                          color: isServed ? '#22c55e' : '#05503c',
                          fontFamily: 'var(--font-bricolage)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase'
                        }}>
                          {order.status === 'served' ? 'Served' : order.status === 'ready' ? 'Ready!' : order.status === 'preparing' ? 'In Kitchen' : 'Received'}
                        </div>
                      </div>

                      {/* Progress Stepper */}
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '0 1rem', marginBottom: '1.5rem' }}>
                        {/* Line */}
                        <div style={{ position: 'absolute', top: 15, left: '10%', right: '10%', height: 2, background: 'rgba(5,80,60,0.06)', zIndex: 0 }} />
                        <div style={{ 
                          position: 'absolute', top: 15, left: '10%', 
                          width: isServed ? '80%' : isReady ? '53.3%' : isPreparing ? '26.6%' : '0%', 
                          height: 2, background: isServed ? '#22c55e' : '#fdca00', zIndex: 1, transition: 'width 0.8s ease' 
                        }} />

                        {/* Steps */}
                        {[
                          { label: 'Sent', icon: CheckCircle, active: true },
                          { label: 'Preparing', icon: ChefHat, active: isPreparing },
                          { label: 'Ready', icon: Bell, active: isReady },
                          { label: 'Served', icon: Utensils, active: isServed },
                        ].map((step, sIdx) => {
                          const Icon = step.icon;
                          const active = step.active;
                          return (
                            <div key={sIdx} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{
                                width: 32, height: 32, borderRadius: '50%', background: active ? '#fdca00' : '#fff',
                                border: `2px solid ${active ? '#fdca00' : 'rgba(5,80,60,0.06)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: active ? '#05503c' : 'rgba(5,80,60,0.2)',
                                transition: 'all 0.4s ease',
                                boxShadow: active ? '0 0 15px rgba(253,202,0,0.3)' : 'none'
                              }}>
                                <Icon size={14} strokeWidth={active ? 3 : 2} style={{ color: active && isServed && step.label === 'Served' ? '#22c55e' : undefined }} />
                              </div>
                              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: active ? (isServed && step.label === 'Served' ? '#22c55e' : '#05503c') : 'rgba(5,80,60,0.3)', textTransform: 'uppercase' }}>{step.label}</span>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ padding: '0.75rem', background: 'rgba(5,80,60,0.02)', borderRadius: 12 }}>
                        {order.items.map((item: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.2rem 0' }}>
                            <span style={{ color: 'rgba(5,80,60,0.6)' }}>{item.quantity}× {item.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: '2rem', background: '#fff', textAlign: 'center', borderTop: '1px solid rgba(5,80,60,0.07)' }}>
              {paymentError && (
                <div style={{ 
                  background: 'rgba(239, 68, 68, 0.05)', 
                  border: '1px solid rgba(239, 68, 68, 0.1)', 
                  borderRadius: '16px', 
                  padding: '1rem', 
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  color: '#ef4444',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textAlign: 'left'
                }}>
                  <XCircle size={20} />
                  <span>{paymentError}</span>
                </div>
              )}

              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(5,80,60,0.4)', marginBottom: '1.5rem', letterSpacing: '0.01em' }}>
                {activeOrders.every(o => o.status === 'served') ? "All your orders have been served. Enjoy!" : "We will notify you when your food is ready."}
              </p>
              
              <button
                onClick={handleSettleBill}
                disabled={settlingPayment || activeOrders.length === 0}
                className="btn-primary shimmer-btn"
                style={{
                  width: '100%', padding: '1.3rem', borderRadius: 24,
                  background: settlingPayment ? 'rgba(5,80,60,0.05)' : 'linear-gradient(135deg, #05503c, #0a6b51)',
                  color: settlingPayment ? '#05503c' : '#ffffff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                  boxShadow: settlingPayment ? 'none' : '0 12px 40px rgba(5,80,60,0.25)',
                  fontSize: '1.05rem',
                  fontFamily: 'var(--font-bricolage)',
                  fontWeight: 800,
                  opacity: (activeOrders.length === 0) ? 0.5 : 1,
                  cursor: (settlingPayment || activeOrders.length === 0) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  border: settlingPayment ? '1px solid rgba(5,80,60,0.1)' : 'none',
                  outline: 'none',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {settlingPayment ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 20, height: 20, border: '3px solid rgba(5,80,60,0.1)', borderTopColor: '#05503c', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                    <span>Securing Session...</span>
                  </div>
                ) : (
                  <>
                    <CreditCard size={22} strokeWidth={2.5} />
                    <span>Pay Bill with Sheger Pay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification System */}
      {toast && (
        <div 
          style={{
            position: 'fixed', bottom: '2.5rem', left: '50%', transform: 'translateX(-50%)',
            zIndex: 200, padding: '1rem 1.5rem', borderRadius: '1.25rem',
            background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#05503c' : '#ffffff',
            color: toast.type === 'info' ? '#05503c' : '#ffffff',
            boxShadow: '0 15px 50px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.9rem',
            minWidth: '280px', pointerEvents: 'auto',
            border: toast.type === 'info' ? '1px solid rgba(5,80,60,0.1)' : 'none'
          }}
          onClick={() => setToast(null)}
        >
          {toast.type === 'error' ? <XCircle size={20} /> : toast.type === 'success' ? <CheckCircle size={20} /> : <Bell size={20} />}
          {toast.message}
          <style>{`
            @keyframes slideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
          `}</style>
          {/* Auto-dismiss after 4s */}
          {setTimeout(() => setToast(null), 4000) && null}
        </div>
      )}

      {/* Item Details Modal */}
      {selectedItem && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 150,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div 
            onClick={() => setSelectedItem(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(5,80,60,0.4)', backdropFilter: 'blur(10px)' }} 
          />
          <div style={{
            position: 'relative', width: '100%', maxWidth: '600px',
            background: '#ffffff', borderRadius: '2.5rem', overflow: 'hidden',
            boxShadow: '0 25px 80px rgba(0,0,0,0.2)',
            animation: 'modalScale 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column'
          }}>
            <button 
              onClick={() => setSelectedItem(null)}
              style={{
                position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 10,
                width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(5,80,60,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#05503c', transition: 'all 0.2s'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ position: 'relative', height: '300px', width: '100%' }}>
                {selectedItem.image_url ? (
                  <img src={selectedItem.image_url} alt={selectedItem.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'rgba(5,80,60,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Coffee size={64} style={{ color: 'rgba(5,80,60,0.1)' }} />
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: '100px', background: 'linear-gradient(to top, #ffffff, transparent)'
                }} />
              </div>

              <div style={{ padding: '0 2.5rem 2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{
                    background: 'rgba(5,80,60,0.05)', borderRadius: '9999px', padding: '0.4rem 1rem',
                    fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.75rem', color: '#05503c',
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}>
                    {selectedItem.category}
                  </span>
                  <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, color: '#fdca00', fontSize: '1.75rem' }}>
                    {Number(selectedItem.price).toFixed(0)} <span style={{ fontSize: '0.85rem' }}>ETB</span>
                  </p>
                </div>

                <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '2.5rem', color: '#05503c', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: '1.5rem' }}>
                  {selectedItem.name}
                </h2>

                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.9rem', color: '#05503c', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
                    Description
                  </h4>
                  <p style={{ color: 'rgba(5,80,60,0.6)', lineHeight: 1.6, fontSize: '1rem' }}>
                    {selectedItem.description}
                  </p>
                </div>

                {selectedItem.ingredients && Array.isArray(selectedItem.ingredients) && selectedItem.ingredients.length > 0 && (
                  <div style={{ marginBottom: '2.5rem' }}>
                    <h4 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.9rem', color: '#05503c', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
                      Ingredients
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                      {selectedItem.ingredients.map((ing: string, i: number) => (
                        <span key={i} style={{
                          padding: '0.5rem 1rem', borderRadius: '12px', background: 'rgba(5,80,60,0.03)',
                          border: '1px solid rgba(5,80,60,0.06)', fontSize: '0.85rem', fontWeight: 600, color: '#05503c'
                        }}>
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (selectedItem.stock_quantity > 0 && !isJoining) handleAddToCart(selectedItem);
                    setSelectedItem(null);
                  }}
                  disabled={selectedItem.stock_quantity <= 0 || isJoining}
                  className="btn-primary shimmer-btn"
                  style={{ 
                    width: '100%', padding: '1.25rem', fontSize: '1.1rem',
                    display: 'flex', justifyContent: 'center', gap: '0.75rem',
                    opacity: (selectedItem.stock_quantity <= 0 || isJoining) ? 0.5 : 1,
                    cursor: (selectedItem.stock_quantity <= 0 || isJoining) ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Plus size={20} /> Add to My Order
                </button>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes modalScale { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9F9F9' }}>
        <div className="loader"></div>
      </div>
    }>
      <MenuContent />
    </Suspense>
  );
}
