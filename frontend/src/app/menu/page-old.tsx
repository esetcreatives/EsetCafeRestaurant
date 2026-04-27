'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShoppingCart, Search, X, Plus, Minus, ChevronDown } from 'lucide-react';
import gsap from 'gsap';
import { Flip } from 'gsap/all';
import { useTabStore, MenuItem } from '@/store/tabStore';
import { menuAPI, sessionAPI, orderAPI } from '@/lib/api';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import Logo from '@/components/ui/Logo';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(Flip);
}

function MenuContent() {
  const searchParams = useSearchParams();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    { id: 'all',        label: 'All Items' },
    { id: 'beverages',  label: 'Coffee & Drinks' },
    { id: 'appetizers', label: 'Brunch' },
    { id: 'mains',      label: 'Mains' },
    { id: 'sides',      label: 'Sides' },
    { id: 'desserts',   label: 'Desserts' },
  ];

  useEffect(() => {
    const tableNumber = searchParams.get('table');
    const token = searchParams.get('token');

    // Public menu mode - no table/token required
    if (!tableNumber || !token) {
      setSessionValid(true); // Allow public access
      loadMenu();
      return;
    }

    // Table session mode - validate token
    sessionAPI.create(parseInt(tableNumber), token).then(({ data, error }) => {
      if (error || !data) {
        setSessionValid(false);
        setLoading(false);
        return;
      }

      setSession(data.table_number, data.table_id, token, data.session_id);
      setSessionValid(true);
      loadMenu();
    });
  }, [searchParams]);

  const loadMenu = async () => {
    const { data, error } = await menuAPI.getAll();
    if (data && !error && Array.isArray(data)) {
      // Ensure price is a number
      const normalizedData = data.map(item => ({
        ...item,
        price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
      }));
      setMenuItems(normalizedData);
      
      // Staggered fade-in animation
      gsap.fromTo(
        '.menu-item-card',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: 'power2.out' }
      );
    }
    setLoading(false);
  };

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleExpandItem = (itemId: number) => {
    // Get the initial state
    const state = Flip.getState('.menu-item-card');
    
    // Toggle expansion
    if (expandedItem === itemId) {
      setExpandedItem(null);
    } else {
      setExpandedItem(itemId);
    }
    
    // Animate with Flip
    setTimeout(() => {
      Flip.from(state, {
        duration: 0.6,
        ease: 'power3.inOut',
        absolute: true,
        zIndex: 100,
        nested: true,
        onEnter: (elements: Element[]) => gsap.fromTo(elements, {opacity: 0}, {opacity: 1}),
        onLeave: (elements: Element[]) => gsap.fromTo(elements, {opacity: 1}, {opacity: 0})
      });
    }, 10);
  };

  const handleAddToCart = (item: MenuItem) => {
    // Ensure price is a number before adding to cart
    const normalizedItem = {
      ...item,
      price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
    };
    addToCart(normalizedItem);
    
    // Pulse animation on cart button
    gsap.fromTo(
      '.cart-button',
      { scale: 1 },
      { scale: 1.2, duration: 0.2, yoyo: true, repeat: 1, ease: 'power2.inOut' }
    );
  };

  const handlePlaceOrder = async () => {
    if (!sessionId || cartItems.length === 0) return;

    const items = cartItems.map((item) => ({
      menu_item_id: item.id,
      quantity: item.quantity,
    }));

    const { data, error } = await orderAPI.place(sessionId, items);
    
    if (data && !error) {
      alert('Order placed successfully!');
      clearCart();
      setShowCart(false);
    } else {
      alert('Failed to place order: ' + error);
    }
  };

  const subtotal = getCartTotal();
  const vat = subtotal * 0.15;
  const service = subtotal * 0.10;
  const total = subtotal + vat + service;

  if (loading) {
    return (
      <div className="min-h-screen bg-alabaster flex flex-col items-center justify-center">
        <div className="text-center">
          <Logo size={100} strokeWidth={1} className="text-deep-emerald mx-auto mb-8 ec-loader" />
          <div className="text-xl font-heading font-bold text-deep-emerald tracking-[0.3em]">ESET CAFE</div>
          <div className="text-xs font-body text-deep-emerald/40 mt-4 tracking-widest uppercase italic">Preparing Digital Experience...</div>
        </div>
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-alabaster flex items-center justify-center p-6">
        <GlassCard className="max-w-md text-center p-12">
          <h1 className="text-4xl font-heading font-bold text-deep-emerald mb-6 tracking-tight">
            Invalid Session
          </h1>
          <p className="text-deep-emerald/70 mb-8 text-lg leading-relaxed">
            Please scan the QR code on your table to access the digital menu.
          </p>
          <a
            href="/"
            className="inline-block btn-primary"
          >
            Return Home
          </a>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9] pb-40">
      {/* Header - Minimalist & Glassmorphic */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-deep-emerald/5 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-heading font-bold text-deep-emerald tracking-tighter">
              ESET <span className="text-golden-ember">Cafe</span>
            </h1>
            {searchParams.get('table') && (
              <>
                <div className="w-[1px] h-6 bg-deep-emerald/10" />
                <p className="text-[0.65rem] tracking-[0.2em] uppercase font-heading font-bold text-deep-emerald/40">
                  Table {searchParams.get('table')}
                </p>
              </>
            )}
          </div>
          {sessionId ? (
            <button
              onClick={() => setShowCart(true)}
              className="cart-button relative p-4 bg-[#05503c] text-[#fdca00] rounded-full hover:shadow-lg transition-all hover:scale-105"
            >
              <ShoppingCart className="w-6 h-6" strokeWidth={1.5} />
              {cartItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-golden-ember text-deep-emerald w-7 h-7 rounded-full text-[0.6rem] flex items-center justify-center font-bold shadow-sm">
                  {cartItems.length}
                </span>
              )}
            </button>
          ) : (
            <a
              href="/"
              className="px-6 py-3 bg-[#05503c] text-[#fdca00] rounded-full hover:shadow-lg transition-all hover:scale-105 font-heading font-bold text-sm"
            >
              Home
            </a>
          )}
        </div>
      </header>

      {/* Sticky Pill Navigation — glassmorphic blur bar */}
      <div className="sticky top-[88px] z-30 bg-[#F9F9F9]/90 backdrop-blur-lg border-b border-deep-emerald/5 px-6 py-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Search Bar */}
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-deep-emerald/30" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Search our selection…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-6 py-4.5 rounded-2xl outline-none font-body text-base transition-all bg-white border border-deep-emerald/5 shadow-sm"
              onFocus={(e) => { e.target.style.borderColor = 'rgba(253,202,0,0.5)'; e.target.style.boxShadow = '0 10px 30px rgba(5,80,60,0.05)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(5,80,60,0.05)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          
          {/* Category Pills — horizontal scroll */}
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide justify-center">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className="px-6 py-3 rounded-full font-heading font-bold whitespace-nowrap transition-all text-[0.7rem] tracking-[0.05em] uppercase border"
                style={{
                  background: selectedCategory === cat.id ? '#05503c' : 'rgba(255,255,255,0.8)',
                  color: selectedCategory === cat.id ? '#ffffff' : 'rgba(5,80,60,0.5)',
                  borderColor: selectedCategory === cat.id ? '#05503c' : 'rgba(5,80,60,0.05)',
                  transform: selectedCategory === cat.id ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: selectedCategory === cat.id ? '0 10px 25px rgba(5,80,60,0.15)' : 'none',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Items Grid */}
      {expandedItem && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] animate-fade-in" 
          onClick={() => handleExpandItem(expandedItem)}
        />
      )}
      <div className="max-w-7xl mx-auto p-6 mt-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
          {filteredItems.map((item) => (
            <div 
              key={item.id} 
              ref={(el: HTMLDivElement | null) => { menuRefs.current[item.id.toString()] = el; }}
              className={`menu-item-card flex flex-col group rounded-[2.5rem] p-8 transition-all duration-500 border border-deep-emerald/5 shadow-sm hover:shadow-xl ${
                expandedItem === item.id 
                  ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] md:w-[600px] h-auto max-h-[85vh] z-[100] bg-white overflow-y-auto' 
                  : 'relative bg-white'
              }`}
              style={{ opacity: 0 }}
            >
              {/* Image Container */}
              <div className="aspect-[4/3] rounded-[1.8rem] mb-8 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-deep-emerald/10 to-transparent opacity-40" />
                <div className="absolute inset-0 bg-[#f5f5f5] group-hover:scale-105 transition-transform duration-1000" />
                {/* Placeholder for real images when available */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Logo size={60} strokeWidth={0.5} className="text-deep-emerald/5" />
                </div>
              </div>
              
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-heading font-bold text-2xl text-deep-emerald tracking-tight leading-none group-hover:text-golden-ember transition-colors">{item.name}</h3>
                <span className="font-heading font-bold text-lg text-deep-emerald/30 tracking-tighter">
                  {Number(item.price).toFixed(0)} ETB
                </span>
              </div>
              
              <p className="text-deep-emerald/50 text-base mb-8 grow leading-relaxed font-body">{item.description}</p>
              
              <div className="flex items-center justify-between pt-6 border-t border-deep-emerald/5">
                <button
                  onClick={() => handleExpandItem(item.id)}
                  className="p-3.5 rounded-2xl bg-deep-emerald/5 text-deep-emerald hover:bg-deep-emerald/10 transition flex items-center gap-2 font-heading font-bold text-xs tracking-wide uppercase"
                >
                  Details <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedItem === item.id ? 'rotate-180' : ''}`} />
                </button>
                {sessionId ? (
                  <button
                    onClick={() => handleAddToCart(item)}
                    disabled={!item.is_available}
                    className="px-8 py-3.5 bg-golden-ember text-deep-emerald rounded-full font-heading font-bold hover:scale-105 transition-all text-sm shimmer-btn disabled:opacity-20 disabled:grayscale shadow-sm"
                  >
                    {item.is_available ? 'Add to Tab' : 'Sold Out'}
                  </button>
                ) : (
                  <div className="px-8 py-3.5 bg-deep-emerald/5 text-deep-emerald/40 rounded-full font-heading font-bold text-sm">
                    {item.is_available ? `${Number(item.price).toFixed(0)} ETB` : 'Sold Out'}
                  </div>
                )}
              </div>

              {/* Expansion Details */}
              {expandedItem === item.id && (
                <div className="mt-8 pt-8 border-t border-deep-emerald/5 animate-fade-in">
                  <h4 className="text-[0.65rem] tracking-[0.2em] uppercase font-heading font-bold text-deep-emerald/40 mb-4">Ingredients</h4>
                  <div className="flex wrap gap-2">
                    {item.ingredients.map(ing => (
                      <span key={ing} className="px-4 py-2 bg-deep-emerald/5 rounded-full text-xs text-deep-emerald/60 font-body">{ing}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Floating Tab Summary - Only show if session exists */}
      {sessionId && cartItems.length > 0 && !showCart && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
          <button
            onClick={() => setShowCart(true)}
            className="bg-[#05503c] text-white pl-8 pr-4 py-4 rounded-full shadow-2xl hover:scale-105 transition-all flex items-center gap-6"
          >
            <div className="flex flex-col items-start leading-none">
              <span className="text-[0.55rem] tracking-[0.3em] uppercase font-heading font-bold text-white/40 mb-1">Your Total Tab</span>
              <span className="font-heading font-bold text-xl text-golden-ember tracking-tighter">{total.toFixed(0)} ETB</span>
            </div>
            <div className="w-12 h-12 bg-golden-ember text-deep-emerald rounded-full flex items-center justify-center font-bold shadow-inner">
              {cartItems.length}
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer - Highly Minimalist */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-deep-emerald/20 backdrop-blur-xl">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden flex flex-col shadow-2xl max-h-[85vh]">
            <div className="p-10 border-b border-deep-emerald/5 flex items-center justify-between">
              <h2 className="text-4xl font-heading font-bold text-deep-emerald tracking-tighter">My Tab</h2>
              <button 
                onClick={() => setShowCart(false)}
                className="w-12 h-12 flex items-center justify-center hover:bg-deep-emerald/5 rounded-full transition"
              >
                <X className="w-6 h-6 text-deep-emerald/40" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 space-y-6">
              {cartItems.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-deep-emerald/20 text-5xl font-heading font-bold mb-4">Empty</p>
                  <p className="text-deep-emerald/40 font-body">Your tab is currently waiting for flavor.</p>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-6 py-4 border-b border-deep-emerald/5 last:border-0">
                    <div className="flex-1">
                      <h3 className="font-heading font-bold text-xl text-deep-emerald mb-1 tracking-tight">{item.name}</h3>
                      <p className="text-sm text-deep-emerald/40 font-body">{Number(item.price).toFixed(0)} ETB each</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                        className="w-10 h-10 rounded-xl bg-deep-emerald/5 hover:bg-deep-emerald/10 flex items-center justify-center transition"
                      >
                        <Minus className="w-3.5 h-3.5 text-deep-emerald" />
                      </button>
                      <span className="w-8 text-center font-bold text-lg font-heading text-deep-emerald">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-10 h-10 rounded-xl bg-deep-emerald/5 hover:bg-deep-emerald/10 flex items-center justify-center transition"
                      >
                        <Plus className="w-3.5 h-3.5 text-deep-emerald" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="w-10 h-10 flex items-center justify-center text-red-300 hover:text-red-500 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            {cartItems.length > 0 && (
              <div className="p-10 bg-[#F9F9F9] space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm uppercase tracking-widest text-deep-emerald/30 font-heading font-bold">
                    <span>Subtotal</span>
                    <span>{subtotal.toFixed(0)} ETB</span>
                  </div>
                  <div className="flex justify-between text-sm uppercase tracking-widest text-deep-emerald/30 font-heading font-bold">
                    <span>Taxes & Service</span>
                    <span>{(vat + service).toFixed(0)} ETB</span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline pt-6 border-t border-deep-emerald/5">
                  <span className="text-3xl font-heading font-bold text-deep-emerald tracking-tighter">Total</span>
                  <span className="text-4xl font-heading font-bold text-golden-ember tracking-tighter">{total.toFixed(0)} ETB</span>
                </div>
                <button
                  onClick={handlePlaceOrder}
                  className="w-full btn-primary py-6 text-xl tracking-tight shadow-2xl shimmer-btn"
                >
                  Send Order to Kitchen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-6xl font-heading font-bold gradient-gold animate-pulse">EC</div>
      </div>
    }>
      <MenuContent />
    </Suspense>
  );
}