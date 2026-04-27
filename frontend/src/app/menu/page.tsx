'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, X, Plus, Minus, Coffee, Search, ArrowRight, User } from 'lucide-react';
import gsap from 'gsap';
import { useTabStore, MenuItem } from '@/store/tabStore';
import { menuAPI, sessionAPI, orderAPI } from '@/lib/api';
import { startManualSessionAction } from '@/app/admin/actions';

function MenuContent() {
  const searchParams = useSearchParams();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
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

  const {
    sessionId,
    cartItems,
    setSession,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
  } = useTabStore();

  const categories = [
    { id: 'all', label: 'All Items' },
    { id: 'beverages', label: 'Coffee & Drinks' },
    { id: 'appetizers', label: 'Appetizers' },
    { id: 'mains', label: 'Mains' },
    { id: 'sides', label: 'Sides' },
    { id: 'desserts', label: 'Desserts' },
  ];

  useEffect(() => {
    const tableNumber = searchParams.get('table');
    const token = searchParams.get('token');
    let interval: NodeJS.Timeout | null = null;

    if (!tableNumber || !token) {
      // Guest mode
      loadMenu();
      interval = setInterval(loadMenu, 10000);
    } else {
      // QR Code mode
      sessionAPI.create(parseInt(tableNumber), token).then(({ data, error }) => {
        if (error || !data) {
          // If token invalid, still allow browsing but don't set session
          loadMenu();
          return;
        }
        
        setSession(data.table_number, data.table_id, token, data.session_id);
        loadMenu();
        interval = setInterval(loadMenu, 10000);
        
        if (data.message === 'Session created') {
          clearCart();
        }
      });
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [searchParams]);

  const loadMenu = async () => {
    const { data, error } = await menuAPI.getAll();
    if (data && !error && Array.isArray(data)) {
      const normalized = data.map(item => ({
        ...item,
        price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
      }));
      setMenuItems(normalized);
      setTimeout(() => {
        if (document.querySelectorAll('.menu-card').length > 0) {
          gsap.fromTo('.menu-card', 
            { opacity: 0, y: 20 }, 
            { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' }
          );
        }
      }, 50);
    }
    setLoading(false);
  };

  const handleStartManualSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const tableNum = parseInt(manualTableNumber);
    if (isNaN(tableNum)) return;

    setManualLoading(true);
    try {
      const result = await startManualSessionAction(tableNum);
      if (result.success && result.data) {
        const { session_id, table_id, token, table_number } = result.data;
        setSession(table_number, table_id, token, session_id);
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

  const filteredItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && item.is_available;
  });

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
      const { data, error } = await orderAPI.place(sessionId, items);
      
      if (data && !error) {
        alert('Order placed successfully! Your food will be prepared shortly.');
        clearCart();
        setShowCart(false);
      } else {
        if (error?.includes('closed') || error?.includes('paid')) {
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
  const vat = subtotal * 0.15;
  const service = subtotal * 0.10;
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
              <p style={{ fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'var(--font-bricolage)', fontWeight: 700, color: '#fdca00' }}>
                Table {useTabStore.getState().tableNumber}
              </p>
            ) : (
              <button 
                onClick={() => setShowTableModal(true)}
                style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-bricolage)', fontWeight: 700, color: 'rgba(5,80,60,0.4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <User size={12} /> Select Table
              </button>
            )}
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="btn-primary shimmer-btn cart-btn"
            style={{ padding: '0.6rem 1.4rem', fontSize: '0.85rem' }}
          >
            <ShoppingCart size={16} />
            {cartItems.length > 0 ? `Cart (${cartItems.length})` : 'Cart'}
          </button>
        </div>
      </nav>

      {/* Sticky filters and search */}
      <div style={{
        position: 'sticky', top: 68, zIndex: 30,
        background: 'rgba(249,249,249,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(5,80,60,0.05)', padding: '1.25rem 1.5rem',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Search */}
          <div style={{ position: 'relative', maxWidth: '600px', width: '100%', margin: '0 auto' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(5,80,60,0.3)' }} />
            <input
              type="text"
              placeholder="Search our selection..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '0.85rem 1rem 0.85rem 3rem',
                borderRadius: '16px', border: '1px solid rgba(5,80,60,0.1)',
                background: '#ffffff', color: '#05503c', fontFamily: 'var(--font-instrument)', fontSize: '0.95rem',
                outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#fdca00'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(253,202,0,0.1)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(5,80,60,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Category pills */}
          <div className="scrollbar-hide" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem', justifyContent: 'center' }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '0.65rem 1.5rem', borderRadius: 9999, border: '1px solid',
                  cursor: 'pointer', fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.78rem',
                  letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  background: selectedCategory === cat.id ? '#05503c' : '#ffffff',
                  color: selectedCategory === cat.id ? '#ffffff' : 'rgba(5,80,60,0.5)',
                  borderColor: selectedCategory === cat.id ? '#05503c' : 'rgba(5,80,60,0.1)',
                  boxShadow: selectedCategory === cat.id ? '0 4px 16px rgba(5,80,60,0.15)' : 'none',
                  transform: selectedCategory === cat.id ? 'scale(1.05)' : 'scale(1)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu grid */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1.5rem', position: 'relative', zIndex: 1 }}>
        {filteredItems.length === 0 ? (
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
                  background: '#ffffff',
                  border: '1px solid rgba(5,80,60,0.07)',
                  borderRadius: '22px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 30px rgba(5,80,60,0.07)',
                  transition: 'transform 0.35s ease, box-shadow 0.35s ease',
                  opacity: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-6px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 20px 50px rgba(5,80,60,0.12)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 30px rgba(5,80,60,0.07)'; }}
              >
                {/* Image */}
                <div style={{ position: 'relative', aspectRatio: '4/3', background: 'linear-gradient(135deg, rgba(5,80,60,0.05), rgba(253,202,0,0.05))', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Coffee size={48} style={{ color: 'rgba(5,80,60,0.1)', position: 'absolute' }} />
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s ease', position: 'relative', zIndex: 1 }}
                      onMouseEnter={e => (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.05)'}
                      onMouseLeave={e => (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'}
                      onError={(e) => { 
                        (e.target as HTMLImageElement).style.opacity = '0'; 
                      }}
                    />
                  )}
                  {/* Category tag */}
                  <span style={{
                    position: 'absolute', top: '1rem', left: '1rem', zIndex: 2,
                    background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(5,80,60,0.1)', borderRadius: '9999px', padding: '0.25rem 0.75rem',
                    fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.7rem', color: '#05503c', letterSpacing: '0.02em',
                  }}>
                    {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                  </span>
                </div>

                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem', gap: '0.5rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.03em', color: '#05503c' }}>{item.name}</h3>
                    <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '1rem', color: '#fdca00', flexShrink: 0 }}>{Number(item.price).toFixed(0)} ETB</span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.9rem', color: 'rgba(5,80,60,0.6)', lineHeight: 1.7, marginBottom: '1.25rem' }}>{item.description}</p>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1.25rem' }}>
                    {item.ingredients.slice(0, 3).map((ing, idx) => (
                      <span key={`${ing}-${idx}`} style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: 'rgba(5,80,60,0.04)', fontSize: '0.7rem', color: 'rgba(5,80,60,0.6)' }}>
                        {ing}
                      </span>
                    ))}
                    {item.ingredients.length > 3 && (
                      <span style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', color: 'rgba(5,80,60,0.4)' }}>
                        +{item.ingredients.length - 3}
                      </span>
                    )}
                  </div>
                  
                  {sessionId && (
                    <button
                      onClick={() => handleAddToCart(item)}
                      className="btn-primary shimmer-btn"
                      style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
                    >
                      <Plus size={16} /> Add to Order
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating cart summary */}
      {sessionId && cartItems.length > 0 && !showCart && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          animation: 'slideUp 0.3s ease-out'
        }}>
          <button
            onClick={() => setShowCart(true)}
            className="btn-primary shimmer-btn"
            style={{ padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '1.5rem', boxShadow: '0 12px 40px rgba(253,202,0,0.4)' }}
          >
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(5,80,60,0.6)', marginBottom: '0.1rem' }}>Your Tab</p>
              <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.3rem', color: '#05503c', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {total.toFixed(0)} ETB
              </p>
            </div>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', background: '#05503c', color: '#fdca00',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.9rem',
            }}>
              {cartItems.length}
            </div>
          </button>
        </div>
      )}

      {/* Table Selection Modal */}
      {showTableModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(2,26,20,0.6)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        }}>
          <div className="glass-card" style={{ maxWidth: 450, width: '100%', padding: '2.5rem', textAlign: 'center', background: '#fff', borderRadius: 32 }}>
            <div style={{ width: 64, height: 64, borderRadius: '24px', background: 'rgba(5,80,60,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#05503c' }}>
              <Coffee size={32} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.8rem', letterSpacing: '-0.03em', color: '#05503c', marginBottom: '0.75rem' }}>
              Welcome to ESET!
            </h2>
            <p style={{ fontFamily: 'var(--font-instrument)', color: 'rgba(5,80,60,0.6)', marginBottom: '2rem', lineHeight: 1.6 }}>
              Where are you sitting today? Please enter your table number to start ordering.
            </p>
            
            <form onSubmit={handleStartManualSession}>
              <input
                type="number"
                placeholder="Table Number (e.g. 5)"
                value={manualTableNumber}
                onChange={e => setManualTableNumber(e.target.value)}
                required
                style={{
                  width: '100%', padding: '1.2rem', borderRadius: '18px', border: '1px solid rgba(5,80,60,0.1)',
                  marginBottom: '1rem', textAlign: 'center', fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-bricolage)',
                  color: '#05503c', outline: 'none'
                }}
              />
              <button 
                type="submit" 
                disabled={manualLoading}
                className="btn-primary shimmer-btn" 
                style={{ width: '100%', padding: '1.2rem', justifyContent: 'center', fontSize: '1rem' }}
              >
                {manualLoading ? 'Setting up Table...' : 'Start Ordering'}
              </button>
            </form>
            
            <button 
              onClick={() => { setShowTableModal(false); setPendingItem(null); }}
              style={{ marginTop: '1rem', background: 'none', border: 'none', color: 'rgba(5,80,60,0.4)', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'var(--font-instrument)' }}
            >
              Just browsing for now
            </button>
          </div>
        </div>
      )}

      {/* Cart modal */}
      {showCart && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2,26,20,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        }}
          onClick={() => setShowCart(false)}
        >
          <div
            className="glass-card"
            style={{
              background: '#ffffff', borderRadius: 28, maxWidth: 600, width: '100%',
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.1)', border: 'none'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(5,80,60,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.03em', color: '#05503c' }}>
                Your Order
              </h2>
              <button
                onClick={() => setShowCart(false)}
                style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(5,80,60,0.06)', border: 'none', color: '#05503c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(5,80,60,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(5,80,60,0.06)'}
              >
                <X size={18} />
              </button>
            </div>

            <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
              {cartItems.length === 0 ? (
                <div style={{ padding: '4rem 0', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '2rem', color: 'rgba(5,80,60,0.1)', marginBottom: '0.5rem' }}>Empty</p>
                  <p style={{ fontFamily: 'var(--font-instrument)', color: 'rgba(5,80,60,0.4)' }}>Your cart is empty.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {cartItems.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', background: 'rgba(5,80,60,0.03)', borderRadius: 20 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '1rem', color: '#05503c', marginBottom: '0.25rem' }}>{item.name}</p>
                        <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.85rem', color: 'rgba(5,80,60,0.5)' }}>{Number(item.price).toFixed(0)} ETB each</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                          style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(5,80,60,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#05503c' }}
                        >
                          <Minus size={14} />
                        </button>
                        <span style={{ width: 28, textAlign: 'center', fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.95rem', color: '#05503c' }}>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(5,80,60,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#05503c' }}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        style={{ width: 32, height: 32, borderRadius: 10, background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '0.5rem' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cartItems.length > 0 && (
              <div style={{ padding: '2rem', borderTop: '1px solid rgba(5,80,60,0.07)', background: '#F9F9F9', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.85rem', color: 'rgba(5,80,60,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <span>Subtotal</span>
                    <span>{subtotal.toFixed(0)} ETB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.85rem', color: 'rgba(5,80,60,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <span>Taxes & Service</span>
                    <span>{(vat + service).toFixed(0)} ETB</span>
                  </div>
                  <div style={{ height: 1, background: 'rgba(5,80,60,0.1)', margin: '0.75rem 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', color: '#05503c' }}>
                    <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.2rem' }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.8rem', color: '#fdca00' }}>{total.toFixed(0)} ETB</span>
                  </div>
                </div>
                <button
                  onClick={handlePlaceOrder}
                  disabled={placingOrder}
                  className="btn-primary shimmer-btn"
                  style={{ width: '100%', padding: '1.2rem', justifyContent: 'center', opacity: placingOrder ? 0.6 : 1, cursor: placingOrder ? 'not-allowed' : 'pointer' }}
                >
                  {placingOrder ? 'Sending...' : 'Send to Kitchen'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      `}</style>
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100svh', background: '#F9F9F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Coffee size={48} style={{ color: '#05503c', animation: 'spin 2s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <MenuContent />
    </Suspense>
  );
}
