'use client';

import { useEffect, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, X, Plus, Minus, Coffee, Search, ArrowRight, User } from 'lucide-react';
import gsap from 'gsap';
import useSWR from 'swr';
import { useTabStore, MenuItem } from '@/store/tabStore';
import { menuAPI, sessionAPI, orderAPI, adminAPI } from '@/lib/api';
import { startManualSessionAction, placeOrderAction } from '@/app/admin/actions';

function MenuContent() {
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState(true); // Always true now to allow browsing
  const [placingOrder, setPlacingOrder] = useState(false);
  
  // Manual Table Selection State
  const [showTableModal, setShowTableModal] = useState(false);
  const [manualTableNumber, setManualTableNumber] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [taxSettings, setTaxSettings] = useState({ vat_rate: 0.15, service_charge_rate: 0.10 });

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
    const tableNumber = searchParams.get('table');
    const token = searchParams.get('token');

    if (tableNumber && token) {
      // QR Code mode - auto join session
      sessionAPI.create(parseInt(tableNumber), token).then(({ data, error }) => {
        if (data && !error) {
          setSession(data.table_number, data.table_id, token, data.session_id, data.session_token);
          if (data.message === 'Session created') {
            clearCart();
          }
        }
      });
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
    if (isNaN(tableNum)) return;

    setManualLoading(true);
    try {
      const result = await startManualSessionAction(tableNum);
      if (result.success && result.data) {
        const { session_id, table_id, token, table_number, session_token } = result.data;
        setSession(table_number, table_id, token, session_id, session_token);
        setShowTableModal(false);
        
        // If they were trying to add an item, add it now
        if (pendingItem) {
          handleAddToCart(pendingItem);
          setPendingItem(null);
        }
      } else {
        alert(result.error || 'Failed to find table. Please check the number.');
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
        alert('Your session has expired or been closed. Please scan the QR code again to start a new session.');
        clearCart();
        setShowCart(false);
        window.location.href = '/menu';
        return;
      }
      
      const items = cartItems.map(item => ({ menu_item_id: item.id, quantity: item.quantity }));
      const result = await placeOrderAction(sessionId, items, '', sessionToken || '');
      
      if (result.success) {
        alert('Order placed successfully! Your food will be prepared shortly.');
        clearCart();
        setShowCart(false);
      } else {
        const error = result.error;
        const errorCode = (result as any).errorCode;

        if (errorCode === 'RATE_LIMITED') {
          alert('Too many orders! Please wait a few minutes before placing another order.');
        } else if (errorCode === 'OUT_OF_STOCK') {
          alert(`One or more items are out of stock: ${error}`);
          // Ideally refresh menu items here
        } else if (error?.includes('closed') || error?.includes('paid') || errorCode === 'SESSION_CLOSED') {
          alert('Your session has expired or been closed. Please scan the QR code again to start a new session.');
          clearCart();
          setShowCart(false);
          window.location.href = '/menu';
        } else {
          alert('Failed to place order: ' + (error || 'Unknown error'));
        }
      }
    } finally {
      setPlacingOrder(false);
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <p style={{ fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-bricolage)', fontWeight: 700, color: '#fdca00' }}>
                  Table {tableNumber}
                </p>
                <button 
                  onClick={() => {
                    if (confirm('Leave this table? Your current cart will be cleared.')) {
                      clearSession();
                      window.location.href = '/menu';
                    }
                  }}
                  style={{ background: 'none', border: 'none', color: 'rgba(5,80,60,0.4)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', padding: '0.2rem' }}
                >
                  (Leave)
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
            
            <div style={{ position: 'relative', minWidth: 'min(100%, 320px)' }}>
              <Search style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(5,80,60,0.3)' }} size={18} />
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '1rem 1.25rem 1rem 3.25rem', borderRadius: 20,
                  border: '1.5px solid rgba(5,80,60,0.1)',
                  background: '#ffffff', color: '#05503c', fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                  outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#fdca00'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(253,202,0,0.1)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(5,80,60,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
          </div>

          {/* Category Dropdown */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '1rem 1.5rem',
                  paddingRight: '3rem',
                  borderRadius: 20,
                  border: '1.5px solid rgba(5,80,60,0.1)',
                  background: '#ffffff',
                  color: '#05503c',
                  fontFamily: 'var(--font-bricolage)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  appearance: 'none',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 20px rgba(5,80,60,0.04)',
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#fdca00'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(5,80,60,0.1)'}
              >
                {categories.map((cat: any) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
              <div style={{ 
                position: 'absolute', right: '1.5rem', top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', color: '#05503c' 
              }}>
                <ArrowRight size={20} style={{ transform: 'rotate(90deg)' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Menu grid */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1.5rem', position: 'relative', zIndex: 1 }}>
        {menuLoading && menuItems.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ height: 400, borderRadius: 24, background: 'rgba(5,80,60,0.03)', animation: 'pulse 1.5s infinite ease-in-out' }} />
            ))}
            <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <Coffee size={48} style={{ color: 'rgba(5,80,60,0.1)', margin: '0 auto 1rem' }} />
            <p style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.2rem', color: '#05503c' }}>No items found</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
            {filteredItems.map(item => (
              <div
                key={item.id}
                className="menu-card"
                style={{
                  background: '#ffffff', borderRadius: 28, overflow: 'hidden',
                  border: '1px solid rgba(5,80,60,0.06)',
                  boxShadow: '0 4px 30px rgba(5,80,60,0.04)',
                  transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
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

                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.15rem', color: '#05503c', letterSpacing: '-0.02em' }}>{item.name}</h3>
                    <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, color: '#fdca00', fontSize: '1.15rem' }}>{Number(item.price).toFixed(0)} <span style={{ fontSize: '0.65rem' }}>ETB</span></p>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(5,80,60,0.6)', lineHeight: 1.5, marginBottom: '1.5rem', height: '2.55rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {item.description}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.stock_quantity > 0) handleAddToCart(item);
                    }}
                    disabled={item.stock_quantity <= 0}
                    className="btn-primary shimmer-btn"
                    style={{ 
                      width: '100%', 
                      display: 'flex', 
                      justifyContent: 'center',
                      opacity: item.stock_quantity <= 0 ? 0.5 : 1,
                      cursor: item.stock_quantity <= 0 ? 'not-allowed' : 'pointer',
                      background: item.stock_quantity <= 0 ? 'rgba(5,80,60,0.1)' : undefined,
                      color: item.stock_quantity <= 0 ? 'rgba(5,80,60,0.4)' : undefined
                    }}
                  >
                    <Plus size={16} /> {item.stock_quantity <= 0 ? 'Sold Out' : 'Add to Order'}
                  </button>
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
