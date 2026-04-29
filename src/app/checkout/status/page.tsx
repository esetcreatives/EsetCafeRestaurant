'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import gsap from 'gsap';
import { CheckCircle2, Clock, XCircle, Coffee, ChevronLeft, CreditCard, Copy, Check, ArrowRight, Banknote, ShieldCheck, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

/* ── Deterministic floater positions (no Math.random in render) ── */
const FLOATERS = [
  { top: '8%', left: '12%', size: 36, rot: 45, dur: 18, delay: -2, gold: true },
  { top: '72%', left: '85%', size: 22, rot: 120, dur: 22, delay: -6, gold: false },
  { top: '35%', left: '92%', size: 30, rot: 200, dur: 20, delay: -4, gold: true },
  { top: '88%', left: '8%', size: 18, rot: 310, dur: 24, delay: -8, gold: false },
  { top: '15%', left: '65%', size: 14, rot: 80, dur: 16, delay: -1, gold: true },
];

function StatusContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('id');
  const [status, setStatus] = useState<string>('pending');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Data fetching & realtime ──
  useEffect(() => {
    if (!paymentId) return;

    const fetchInitial = async () => {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();
      if (data) {
        setStatus(data.status);
        setPaymentData(data);
      }
    };
    fetchInitial();

    const channel = supabase
      .channel('payment-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${paymentId}` },
        (payload: any) => {
          setStatus(payload.new.status);
          setPaymentData(payload.new);
          if (payload.new.status === 'approved') {
            gsap.fromTo(".status-card", { scale: 0.97 }, { scale: 1, duration: 0.8, ease: "elastic.out(1, 0.4)" });
            gsap.fromTo(".success-glow", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1.5, duration: 1.2, ease: "power2.out" });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [paymentId]);

  // ── Entry animations ──
  useEffect(() => {
    gsap.fromTo(".status-card", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.9, ease: "power4.out" });
    gsap.fromTo(".anim-row", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, delay: 0.3, ease: "power3.out" });
  }, [status]);

  // ── Status config ──
  const statusConfig = useMemo(() => ({
    pending:  { icon: Clock,        color: '#fdca00', bg: 'rgba(253,202,0,0.08)', border: 'rgba(253,202,0,0.25)', title: 'Complete Your Payment', desc: 'Transfer the amount below via CBE to confirm your order.' },
    verified: { icon: ShieldCheck,   color: '#05503c', bg: 'rgba(5,80,60,0.06)', border: 'rgba(5,80,60,0.15)', title: 'Verifying Transfer', desc: 'Our staff is confirming your payment. This usually takes a minute.' },
    approved: { icon: CheckCircle2,  color: '#059669', bg: 'rgba(5,150,105,0.06)', border: 'rgba(5,150,105,0.15)', title: 'Payment Confirmed!', desc: 'Your order is confirmed. The kitchen is preparing your meal.' },
    rejected: { icon: XCircle,       color: '#e11d48', bg: 'rgba(225,29,72,0.05)', border: 'rgba(225,29,72,0.15)', title: 'Payment Declined', desc: '' },
    failed:   { icon: AlertTriangle, color: '#e11d48', bg: 'rgba(225,29,72,0.05)', border: 'rgba(225,29,72,0.15)', title: 'Something Went Wrong', desc: 'Please try again or visit the counter for help.' },
  }), []);

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = cfg.icon;

  // ── Steps for the stepper ──
  const steps = [
    { key: 'pending', label: 'Transfer' },
    { key: 'verified', label: 'Verifying' },
    { key: 'approved', label: 'Confirmed' },
  ];
  const stepOrder = ['pending', 'verified', 'approved'];
  const currentStepIdx = stepOrder.indexOf(status);
  const isFailed = status === 'rejected' || status === 'failed';

  if (!paymentId) {
    return (
      <div style={{ minHeight: '100svh', background: '#F9F9F9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'var(--font-instrument), system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ width: 72, height: 72, background: 'rgba(225,29,72,0.06)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', border: '1px solid rgba(225,29,72,0.12)' }}>
            <XCircle size={36} color="#e11d48" />
          </div>
          <h1 style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.6rem', fontWeight: 800, color: '#05503c', marginBottom: '0.5rem', letterSpacing: '-0.03em' }}>Invalid Payment Link</h1>
          <p style={{ color: 'rgba(5,80,60,0.5)', marginBottom: '2rem', lineHeight: 1.6 }}>This link is invalid or has expired. Please return to the menu.</p>
          <Link href="/menu" className="btn-primary shimmer-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '1rem' }}>
            Return to Menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100svh', background: '#F9F9F9', fontFamily: 'var(--font-instrument), system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      {/* ── Background ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: 550, height: 550, borderRadius: '50%', background: 'radial-gradient(circle, rgba(253,202,0,0.07) 0%, transparent 65%)', filter: 'blur(90px)' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: 450, height: 450, borderRadius: '50%', background: 'radial-gradient(circle, rgba(5,80,60,0.06) 0%, transparent 65%)', filter: 'blur(90px)' }} />
        {FLOATERS.map((f, i) => (
          <div key={i} style={{ position: 'absolute', top: f.top, left: f.left, width: f.size, height: f.size, background: f.gold ? 'rgba(253,202,0,0.04)' : 'rgba(5,80,60,0.04)', borderRadius: 10, transform: `rotate(${f.rot}deg)`, animation: `floatUp ${f.dur}s ease-in-out infinite`, animationDelay: `${f.delay}s` }} />
        ))}
        <style>{`@keyframes floatUp { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-30px) rotate(180deg); } }`}</style>
      </div>

      {/* ── Top Bar ── */}
      <nav style={{ position: 'relative', zIndex: 20, padding: '1.2rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/menu" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(5,80,60,0.5)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', transition: 'color 0.2s' }}>
          <ChevronLeft size={18} /> Menu
        </Link>
        <span style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.9rem', color: '#05503c', letterSpacing: '-0.02em' }}>
          ESET <span style={{ color: '#fdca00' }}>Cafe</span>
        </span>
        <div style={{ width: 60 }} /> {/* Spacer for centering */}
      </nav>

      {/* ── Main Card ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'center', padding: '0.5rem 1.25rem 3rem' }}>
        <div className="status-card" style={{
          width: '100%', maxWidth: 440,
          background: '#ffffff',
          border: '1px solid rgba(5,80,60,0.06)',
          borderRadius: 32,
          boxShadow: '0 12px 48px rgba(5,80,60,0.06)',
          overflow: 'hidden',
        }}>

          {/* ── Status Icon & Heading ── */}
          <div className="anim-row" style={{ padding: '2.5rem 2rem 0', textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '1.5rem' }}>
              {status === 'approved' && <div className="success-glow" style={{ position: 'absolute', inset: -20, background: `radial-gradient(circle, ${cfg.bg} 0%, transparent 70%)`, borderRadius: '50%', opacity: 0 }} />}
              <div style={{
                width: 80, height: 80, borderRadius: 24,
                background: cfg.bg,
                border: `1.5px solid ${cfg.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', zIndex: 1,
              }}>
                <Icon size={40} color={cfg.color} strokeWidth={status === 'approved' ? 2.5 : 2} />
                {status === 'pending' && (
                  <div style={{ position: 'absolute', inset: -3, border: `2px solid ${cfg.border}`, borderRadius: 27, animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.4 }} />
                )}
              </div>
              <style>{`@keyframes ping { 75%,100% { transform: scale(1.4); opacity: 0; } }`}</style>
            </div>

            <h1 style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.7rem', fontWeight: 800, color: '#05503c', letterSpacing: '-0.03em', marginBottom: '0.5rem', lineHeight: 1.1 }}>
              {cfg.title}
            </h1>
            <p style={{ color: 'rgba(5,80,60,0.5)', fontSize: '0.92rem', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
              {status === 'rejected'
                ? <span style={{ color: '#e11d48', fontWeight: 600 }}>{paymentData?.metadata?.rejection_reason || 'Transaction could not be verified.'}</span>
                : cfg.desc}
            </p>
          </div>

          {/* ── Progress Stepper ── */}
          {!isFailed && (
            <div className="anim-row" style={{ padding: '2rem 2.5rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                {/* Line behind steps */}
                <div style={{ position: 'absolute', top: 16, left: 32, right: 32, height: 2, background: 'rgba(5,80,60,0.06)', zIndex: 0 }} />
                <div style={{ position: 'absolute', top: 16, left: 32, height: 2, background: status === 'approved' ? '#059669' : '#fdca00', width: currentStepIdx === 0 ? '0%' : currentStepIdx === 1 ? '50%' : '100%', maxWidth: 'calc(100% - 64px)', transition: 'width 1s cubic-bezier(0.4,0,0.2,1)', zIndex: 1 }} />

                {steps.map((step, i) => {
                  const done = i <= currentStepIdx;
                  const isCurrent = i === currentStepIdx;
                  return (
                    <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative', zIndex: 2 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: done ? (status === 'approved' ? '#059669' : '#fdca00') : '#ffffff',
                        border: `2px solid ${done ? (status === 'approved' ? '#059669' : '#fdca00') : 'rgba(5,80,60,0.1)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.5s ease',
                        boxShadow: isCurrent ? `0 0 0 4px ${status === 'approved' ? 'rgba(5,150,105,0.15)' : 'rgba(253,202,0,0.2)'}` : 'none',
                      }}>
                        {done ? <Check size={14} color="#fff" strokeWidth={3} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(5,80,60,0.15)' }} />}
                      </div>
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: done ? '#05503c' : 'rgba(5,80,60,0.3)' }}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Bank Transfer Details (pending only) ── */}
          {status === 'pending' && (
            <div className="anim-row" style={{ padding: '2rem 1.5rem 0' }}>
              <div style={{ background: '#faf8f2', border: '1px solid rgba(5,80,60,0.06)', borderRadius: 24, padding: '1.5rem', }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <span style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#fdca00' }}>Bank Transfer</span>
                  <span style={{ background: 'rgba(5,80,60,0.06)', padding: '0.3rem 0.7rem', borderRadius: 8, fontSize: '0.65rem', fontWeight: 800, color: '#05503c', letterSpacing: '0.05em' }}>CBE</span>
                </div>

                {/* Recipient */}
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(5,80,60,0.4)', marginBottom: 4 }}>Recipient</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#05503c' }}>Matiyas Zelalem Alemayehu</span>
                </div>

                {/* Account Number */}
                <div style={{ marginBottom: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(5,80,60,0.06)' }}>
                  <span style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(5,80,60,0.4)', marginBottom: 4 }}>Account Number</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.15rem', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#05503c', letterSpacing: '-0.02em' }}>1000454676436</span>
                    <button
                      onClick={() => copyToClipboard('1000454676436', 'acc')}
                      style={{ background: copiedId === 'acc' ? 'rgba(5,150,105,0.1)' : 'rgba(5,80,60,0.05)', border: 'none', borderRadius: 8, padding: '0.35rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: copiedId === 'acc' ? '#059669' : 'rgba(5,80,60,0.4)' }}
                    >
                      {copiedId === 'acc' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Reference Code — Highlighted */}
                <div style={{ background: '#ffffff', border: '1.5px solid rgba(253,202,0,0.35)', borderRadius: 16, padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: -8, right: -8, opacity: 0.06 }}>
                    <CreditCard size={64} color="#fdca00" />
                  </div>
                  <span style={{ display: 'block', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(5,80,60,0.45)', marginBottom: 6 }}>Reference Code <span style={{ color: '#e11d48' }}>*</span></span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '1.5rem', fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#fdca00', letterSpacing: '0.05em' }}>
                      {paymentData?.transaction_code || '---'}
                    </span>
                    <button
                      onClick={() => copyToClipboard(paymentData?.transaction_code || '', 'ref')}
                      style={{ background: copiedId === 'ref' ? 'rgba(5,150,105,0.12)' : 'rgba(253,202,0,0.1)', border: 'none', borderRadius: 10, padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.25s', color: copiedId === 'ref' ? '#059669' : '#fdca00' }}
                    >
                      {copiedId === 'ref' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <p style={{ textAlign: 'center', fontSize: '0.65rem', color: 'rgba(5,80,60,0.4)', marginTop: '0.75rem', fontStyle: 'italic' }}>
                  Include this code in your transfer note
                </p>
              </div>
            </div>
          )}

          {/* ── How It Works (pending only) ── */}
          {status === 'pending' && (
            <div className="anim-row" style={{ padding: '1.5rem 1.5rem 0' }}>
              <p style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(5,80,60,0.3)', marginBottom: '0.75rem' }}>How it works</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {[
                  { num: '1', text: 'Open CBE Mobile and transfer the amount' },
                  { num: '2', text: 'Include the reference code in the note' },
                  { num: '3', text: "We'll verify & confirm automatically" },
                ].map((s) => (
                  <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(253,202,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, color: '#fdca00', flexShrink: 0 }}>{s.num}</div>
                    <span style={{ fontSize: '0.82rem', color: 'rgba(5,80,60,0.6)', fontWeight: 500 }}>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Approved: Kitchen Info ── */}
          {status === 'approved' && (
            <div className="anim-row" style={{ padding: '1.5rem 1.5rem 0' }}>
              <div style={{ background: 'rgba(5,150,105,0.04)', border: '1px solid rgba(5,150,105,0.1)', borderRadius: 20, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 48, height: 48, background: 'rgba(5,150,105,0.08)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Coffee size={24} color="#059669" />
                </div>
                <div>
                  <p style={{ fontFamily: 'var(--font-bricolage)', fontWeight: 800, fontSize: '0.95rem', color: '#05503c' }}>
                    Serving Table {paymentData?.sessions?.tables?.number || '...'}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'rgba(5,80,60,0.5)', marginTop: 2 }}>Your order is being prepared now.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Footer: Amount & Status ── */}
          <div className="anim-row" style={{ padding: '1.5rem 1.5rem 2rem', marginTop: '0.5rem' }}>
            <div style={{ background: '#faf8f2', borderRadius: 20, padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(5,80,60,0.4)' }}>Total</span>
                <span style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.3rem', fontWeight: 800, color: '#05503c' }}>
                  {(paymentData?.total || 0).toLocaleString()} <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(5,80,60,0.4)' }}>ETB</span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px dashed rgba(5,80,60,0.08)' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(5,80,60,0.4)' }}>Status</span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize',
                  padding: '0.3rem 0.75rem', borderRadius: 8,
                  background: status === 'approved' ? 'rgba(5,150,105,0.08)' : status === 'pending' ? 'rgba(253,202,0,0.12)' : isFailed ? 'rgba(225,29,72,0.06)' : 'rgba(5,80,60,0.05)',
                  color: status === 'approved' ? '#059669' : status === 'pending' ? '#b8860b' : isFailed ? '#e11d48' : '#05503c',
                }}>
                  {status}
                </span>
              </div>
            </div>

            {/* Back to menu */}
            <Link href="/menu" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              marginTop: '1.25rem', padding: '0.9rem', borderRadius: 14,
              border: '1px solid rgba(5,80,60,0.08)', background: 'transparent',
              color: 'rgba(5,80,60,0.5)', fontSize: '0.85rem', fontWeight: 700,
              textDecoration: 'none', transition: 'all 0.2s',
            }}>
              <ChevronLeft size={16} /> Back to Menu
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderStatusPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100svh', background: '#F9F9F9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="animate-pulse" style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 32, padding: '3rem 2rem', border: '1px solid rgba(5,80,60,0.04)' }}>
          <div style={{ width: 80, height: 80, background: 'rgba(5,80,60,0.04)', borderRadius: 24, margin: '0 auto 1.5rem' }} />
          <div style={{ height: 28, background: 'rgba(5,80,60,0.04)', borderRadius: 12, width: '70%', margin: '0 auto 0.75rem' }} />
          <div style={{ height: 16, background: 'rgba(5,80,60,0.03)', borderRadius: 10, width: '50%', margin: '0 auto 2rem' }} />
          <div style={{ height: 180, background: 'rgba(5,80,60,0.02)', borderRadius: 20, marginBottom: '1.5rem' }} />
          <div style={{ height: 80, background: 'rgba(5,80,60,0.02)', borderRadius: 16 }} />
        </div>
      </div>
    }>
      <StatusContent />
    </Suspense>
  );
}
