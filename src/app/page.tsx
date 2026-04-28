'use client';

import { useEffect, useRef, useState } from 'react';
import { Coffee, Utensils, Star, Clock, MapPin, ArrowRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import LogoIntro from '@/components/intro/LogoIntro';
import { menuAPI } from '@/lib/api';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const FEATURES = [
  { icon: Coffee, title: 'Transparent Pour', desc: 'Single-origin Ethiopian beans, ground fresh, presented without noise or distraction.' },
  { icon: Utensils, title: 'Ancestral Craft', desc: 'Recipes passed down through generations, refined to their most honest and beautiful form.' },
  { icon: Star, title: 'Curated Experience', desc: 'Every element — from lighting to plating — is intentional to help you slow down and savour.' },
];

export default function Home() {
  const [showIntro, setShowIntro] = useState(false);
  const [featuredDishes, setFeaturedDishes] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Fetch featured menu items
    const fetchFeaturedItems = async () => {
      try {
        const { data, error } = await menuAPI.getAll();
        if (data && !error && Array.isArray(data)) {
          // Get top 3 available items, prioritize items with images
          const available = data.filter((item: any) => item.is_available);
          const signature = available.filter((item: any) => item.is_signature);
          
          // If we have signature dishes, use them. Otherwise fallback to original logic
          const featured = signature.length > 0 
            ? signature.slice(0, 3)
            : available.filter((item: any) => item.image_url).slice(0, 3);
          
          setFeaturedDishes(featured.length > 0 ? featured : available.slice(0, 3));
        }
      } catch (error) {
        console.error('Failed to fetch featured items:', error);
      }
    };
    fetchFeaturedItems();
  }, []);

  useEffect(() => {
    if (showIntro) return;
    const ctx = gsap.context(() => {
      // Staggered reveal for each marked section
      gsap.utils.toArray<HTMLElement>('.gs-reveal').forEach((el) => {
        gsap.fromTo(el,
          { opacity: 0, y: 32 },
          {
            opacity: 1, y: 0, duration: 0.85, ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 90%' },
          }
        );
      });
    }, mainRef);
    return () => ctx.revert();
  }, [showIntro]);

  return (
    <div ref={mainRef} className="min-h-screen" style={{ background: '#F9F9F9', color: '#05503c' }}>
      {/* ─── NAVIGATION ──────────────────────────────────── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
        style={{
          padding: '1.1rem 1.5rem',
          background: 'rgba(249,249,249,0.88)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(5,80,60,0.07)',
        }}
      >
        {/* Logo */}
        <a href="#hero" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-0.04em', color: '#05503c' }}>
            ESET <span style={{ color: '#fdca00' }}>Cafe</span>
          </span>
        </a>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8" style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.9rem', color: 'rgba(5,80,60,0.65)' }}>
          <a href="#story" className="hover:text-[#05503c] transition-colors">Story</a>
          <a href="#menu" className="hover:text-[#05503c] transition-colors">Menu</a>
          <a href="#visit" className="hover:text-[#05503c] transition-colors">Visit</a>
        </div>

        {/* CTA */}
        <Link href="/menu" className="btn-primary shimmer-btn" style={{ padding: '0.6rem 1.4rem', fontSize: '0.85rem' }}>
          Order Now
        </Link>
      </nav>

      {/* ─── HERO — NO IMAGE, PURE WHITE SPACE ───────────── */}
      <section
        id="hero"
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '8rem 1.5rem 5rem',
          background: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle radial glow for depth */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 70% 60% at 50% 30%, rgba(253,202,0,0.07) 0%, transparent 70%)',
        }} />
        {/* Second glow — emerald tint, bottom */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 50% 90%, rgba(5,80,60,0.05) 0%, transparent 70%)',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '780px', width: '100%' }}>
          {/* Eyebrow */}
          <p style={{
            fontFamily: 'var(--font-instrument)',
            fontSize: '0.72rem',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#fdca00',
            fontWeight: 600,
            marginBottom: '1.5rem',
          }}>
            Est. Addis Ababa · Ethiopian Fusion
          </p>

          {/* Main wordmark */}
          <h1 style={{
            fontFamily: 'var(--font-bricolage)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 0.95,
            color: '#05503c',
            marginBottom: '0.15em',
            fontSize: 'clamp(3.8rem, 14vw, 10rem)',
          }}>
            ESET
          </h1>
          <h1 style={{
            fontFamily: 'var(--font-bricolage)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 0.95,
            color: '#fdca00',
            marginBottom: '2rem',
            fontSize: 'clamp(3rem, 10vw, 7.5rem)',
          }}>
            Cafe
          </h1>

          {/* Tagline */}
          <p style={{
            fontFamily: 'var(--font-instrument)',
            fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
            color: 'rgba(5,80,60,0.6)',
            lineHeight: 1.7,
            marginBottom: '3rem',
            maxWidth: '480px',
            margin: '0 auto 3rem',
          }}>
            Where Ethiopian highland traditions meet modern minimalist craft.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/menu" className="btn-primary shimmer-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 2rem', fontSize: '0.95rem' }}>
              View Guest Menu <ArrowRight style={{ width: '1rem', height: '1rem' }} />
            </Link>
            <a href="#story" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 2rem', fontSize: '0.95rem' }}>
              Our Story <ChevronDown style={{ width: '1rem', height: '1rem' }} />
            </a>
          </div>
        </div>

        {/* Floating scroll cue */}
        <div style={{ position: 'absolute', bottom: '2.5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: '1px', height: '3.5rem', background: 'linear-gradient(to bottom, transparent, rgba(5,80,60,0.25))', animation: 'pulse 2s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ─── OUR STORY ───────────────────────────────────── */}
      <section id="story" style={{ background: '#F9F9F9', padding: '5rem 1.5rem 6rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

          {/* Section label */}
          <p className="gs-reveal" style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.72rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fdca00', fontWeight: 600, marginBottom: '1.2rem' }}>
            Our Philosophy
          </p>

          {/* Headline */}
          <h2 className="gs-reveal" style={{
            fontFamily: 'var(--font-bricolage)', fontWeight: 800,
            fontSize: 'clamp(2.4rem, 6vw, 5rem)',
            letterSpacing: '-0.04em', lineHeight: 1.0,
            color: '#05503c', marginBottom: '3.5rem',
            maxWidth: '560px',
          }}>
            A story<br />of pure<br />flavor.
          </h2>

          {/* Two-column layout on md+, stacked on mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="gs-reveal" style={{
                background: '#ffffff',
                border: '1px solid rgba(5,80,60,0.07)',
                borderRadius: '20px',
                padding: '2rem',
                boxShadow: '0 4px 24px rgba(5,80,60,0.05)',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                animationDelay: `${i * 0.1}s`,
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(5,80,60,0.09)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(5,80,60,0.05)'; }}
              >
                <div style={{ width: '2.8rem', height: '2.8rem', borderRadius: '12px', background: 'rgba(253,202,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.2rem' }}>
                  <Icon style={{ width: '1.25rem', height: '1.25rem', color: '#fdca00' }} strokeWidth={1.5} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '1.15rem', letterSpacing: '-0.03em', color: '#05503c', marginBottom: '0.5rem' }}>{title}</h3>
                <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.95rem', color: 'rgba(5,80,60,0.6)', lineHeight: 1.75 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SIGNATURE DISHES ────────────────────────────── */}
      <section id="menu" style={{ background: '#ffffff', padding: '5rem 1.5rem 6rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

          <p className="gs-reveal" style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.72rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fdca00', fontWeight: 600, marginBottom: '1.2rem' }}>
            Curated Selection
          </p>
          <h2 className="gs-reveal" style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: 'clamp(2.2rem, 5vw, 4rem)', letterSpacing: '-0.04em', color: '#05503c', marginBottom: '3rem' }}>
            Signature Dishes
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
            {featuredDishes.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                padding: '3rem 2rem',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.75)',
                borderRadius: 18,
                border: '1px solid rgba(5,80,60,0.07)',
              }}>
                <Coffee size={32} style={{ color: 'rgba(5,80,60,0.2)', marginBottom: '1rem' }} />
                <p style={{ fontSize: '0.9rem', color: 'rgba(5,80,60,0.3)' }}>Loading featured dishes...</p>
              </div>
            ) : featuredDishes.map((dish, i) => {
              const categoryTags: Record<string, string> = {
                appetizers: 'Appetizer',
                mains: 'Main Course',
                sides: 'Side Dish',
                desserts: 'Dessert',
                beverages: 'Beverage',
              };
              
              return (
              <div key={dish.id} className="gs-reveal" style={{
                background: '#ffffff',
                border: '1px solid rgba(5,80,60,0.07)',
                borderRadius: '22px',
                overflow: 'hidden',
                boxShadow: '0 4px 30px rgba(5,80,60,0.07)',
                transition: 'transform 0.35s ease, box-shadow 0.35s ease',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-6px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 20px 50px rgba(5,80,60,0.12)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 30px rgba(5,80,60,0.07)'; }}
              >
                {/* Image */}
                <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(5,80,60,0.05), rgba(253,202,0,0.05))' }}>
                  {dish.image_url ? (
                    <img
                      src={dish.image_url}
                      alt={dish.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s ease' }}
                      onMouseEnter={e => (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.05)'}
                      onMouseLeave={e => (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'}
                      onError={(e) => {
                        // If it fails, hide the img and show the placeholder div
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const placeholder = parent.querySelector('.img-placeholder') as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div className="img-placeholder" style={{ 
                    display: dish.image_url ? 'none' : 'flex', 
                    width: '100%', height: '100%', 
                    alignItems: 'center', justifyContent: 'center' 
                  }}>
                    <Coffee size={48} style={{ color: 'rgba(5,80,60,0.1)' }} />
                  </div>
                  {/* Tag badge */}
                  <span style={{
                    position: 'absolute', top: '1rem', left: '1rem',
                    background: 'rgba(255,255,255,0.92)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(5,80,60,0.1)',
                    borderRadius: '9999px',
                    padding: '0.25rem 0.75rem',
                    fontFamily: 'var(--font-bricolage)',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    color: '#05503c',
                    letterSpacing: '0.02em',
                  }}>
                    {categoryTags[dish.category] || dish.category}
                  </span>
                </div>

                {/* Card body */}
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem', gap: '0.5rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.03em', color: '#05503c' }}>{dish.name}</h3>
                    <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '1rem', color: '#fdca00', flexShrink: 0 }}>{Number(dish.price).toFixed(0)} ETB</span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.9rem', color: 'rgba(5,80,60,0.6)', lineHeight: 1.7, marginBottom: '1.25rem' }}>{dish.description}</p>
                  <Link href="/menu" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    fontFamily: 'var(--font-bricolage)', fontWeight: 700,
                    fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: '#05503c', textDecoration: 'none',
                    transition: 'color 0.2s',
                  }}>
                    Discover <ArrowRight style={{ width: '0.9rem', height: '0.9rem' }} />
                  </Link>
                </div>
              </div>
            );
            })}
          </div>

          {/* Full menu CTA */}
          <div className="gs-reveal" style={{ textAlign: 'center', marginTop: '3.5rem' }}>
            <Link href="/menu" className="btn-primary shimmer-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 2.5rem', fontSize: '0.95rem', boxShadow: '0 8px 30px rgba(253,202,0,0.25)' }}>
              Explore Full Menu <ArrowRight style={{ width: '1rem', height: '1rem' }} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── VISIT ───────────────────────────────────────── */}
      <section id="visit" style={{ background: '#05503c', padding: '5rem 1.5rem 6rem', position: 'relative', overflow: 'hidden' }}>
        {/* Subtle dot grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(253,202,0,0.18) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }} />
        {/* Gold radial glow */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: '600px', height: '600px', borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(253,202,0,0.07) 0%, transparent 70%)',
        }} />

        <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <p className="gs-reveal" style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.72rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fdca00', fontWeight: 600, marginBottom: '1.25rem' }}>
            Come As You Are
          </p>
          <h2 className="gs-reveal" style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: 'clamp(2.4rem, 7vw, 5rem)', letterSpacing: '-0.04em', lineHeight: 1.0, color: '#ffffff', marginBottom: '3.5rem' }}>
            A table is<br />waiting for you.
          </h2>

          {/* Info grid */}
          <div className="gs-reveal" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap', marginBottom: '3rem' }}>
            {[
              { icon: Clock, label: 'Hours', value: 'Mon–Fri  11AM–10PM', sub: 'Sat–Sun  10AM–11PM' },
              { icon: MapPin, label: 'Location', value: 'Addis Ababa', sub: 'Ethiopia · Near Bole' },
            ].map(({ icon: Icon, label, value, sub }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '3rem', height: '3rem', borderRadius: '14px', background: 'rgba(253,202,0,0.12)', border: '1px solid rgba(253,202,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon style={{ width: '1.2rem', height: '1.2rem', color: '#fdca00' }} strokeWidth={1.5} />
                </div>
                <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>{label}</p>
                <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', letterSpacing: '-0.02em' }}>{value}</p>
                <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>{sub}</p>
              </div>
            ))}
          </div>

          <div className="gs-reveal">
            <Link href="/menu" className="shimmer-btn" style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.95rem',
              background: '#fdca00', color: '#05503c',
              padding: '1rem 2.5rem', borderRadius: '9999px',
              textDecoration: 'none',
              boxShadow: '0 4px 24px rgba(253,202,0,0.3)',
              transition: 'transform 0.25s ease, box-shadow 0.25s ease',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(253,202,0,0.4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(253,202,0,0.3)'; }}
            >
              Order At Your Table <ArrowRight style={{ width: '1rem', height: '1rem' }} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────── */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid rgba(5,80,60,0.07)', padding: '2.5rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.04em', color: '#05503c' }}>
            ESET <span style={{ color: '#fdca00' }}>Cafe</span>
          </p>
          <p style={{ fontFamily: 'var(--font-instrument)', fontSize: '0.8rem', color: 'rgba(5,80,60,0.35)' }}>
            © {isMounted ? new Date().getFullYear() : '2024'} ESET Cafe · Ethiopian Fusion · Addis Ababa
          </p>
        </div>
      </footer>
    </div>
  );
}
