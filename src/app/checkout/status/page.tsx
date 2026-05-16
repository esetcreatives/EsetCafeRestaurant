'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import gsap from 'gsap';
import { CheckCircle2, Clock, XCircle, Coffee, ChevronLeft, CreditCard, Copy, Check, ArrowRight, Banknote, ShieldCheck, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import Link from 'next/link';
import { resetPaymentStatusAction } from '../actions';
import {
  playPaymentSuccess,
  playError,
  showNotification,
  requestNotificationPermission,
} from '@/lib/sounds';

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
  const [showGuide, setShowGuide] = useState(false);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [submitted, setSubmitted] = useState(false);
  const [waitLonger, setWaitLonger] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (submitted && status === 'pending') {
      timer = setTimeout(() => setWaitLonger(true), 10000);
    } else {
      setWaitLonger(false);
    }
    return () => clearTimeout(timer);
  }, [submitted, status]);

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
        if (data.transaction_code && !data.transaction_code.startsWith('SP-')) {
          // They already submitted a real code
          setSubmitted(true);
        }
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
          if (payload.new.status === 'verified') {
            setSubmitted(false); // Clear local wait state since we are now in 'verified'
          }
          if (payload.new.status === 'approved') {
            playPaymentSuccess();
            showNotification('✅ Payment Confirmed!', 'Your order is being sent to the kitchen now.');
            gsap.fromTo(".status-card", { scale: 0.97 }, { scale: 1, duration: 0.8, ease: "elastic.out(1, 0.4)" });
            gsap.fromTo(".success-glow", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1.5, duration: 1.2, ease: "power2.out" });
          }
          if (payload.new.status === 'rejected' || payload.new.status === 'failed') {
            playError();
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
    pending: { icon: Clock, color: '#fdca00', bg: 'rgba(253,202,0,0.08)', border: 'rgba(253,202,0,0.25)', title: 'Complete Your Payment', desc: 'Transfer the amount below to confirm your order.' },
    verified: { icon: ShieldCheck, color: '#05503c', bg: 'rgba(5,80,60,0.06)', border: 'rgba(5,80,60,0.15)', title: 'Verifying Transfer', desc: 'Our staff is confirming your payment. This usually takes a minute.' },
    approved: { icon: CheckCircle2, color: '#059669', bg: 'rgba(5,150,105,0.06)', border: 'rgba(5,150,105,0.15)', title: 'Payment Confirmed.', desc: 'Sending your order to the kitchen.' },
    rejected: { icon: XCircle, color: '#e11d48', bg: 'rgba(225,29,72,0.05)', border: 'rgba(225,29,72,0.15)', title: 'Payment Declined', desc: '' },
    failed: { icon: AlertTriangle, color: '#e11d48', bg: 'rgba(225,29,72,0.05)', border: 'rgba(225,29,72,0.15)', title: 'Payment Failed', desc: 'Please check your bank balance or try again.' },
    expired: { icon: Clock, color: '#e11d48', bg: 'rgba(225,29,72,0.05)', border: 'rgba(225,29,72,0.15)', title: 'Code Expired', desc: 'This transaction code has expired. Please try again.' },
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
  const isFailed = status === 'rejected' || status === 'failed' || status === 'expired';

  const simulatePayment = async () => {
    if (!paymentData?.transaction_code) return;

    setToast({ message: 'Simulating successful payment...', type: 'info' });

    try {
      const response = await fetch('/api/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_code: paymentData.transaction_code,
          status: 'success',
          amount: paymentData.total
        })
      });

      if (!response.ok) throw new Error('Simulation failed');
    } catch (err: any) {
      setToast({ message: 'Simulation Error: ' + err.message, type: 'error' });
    }
  };

  const [toast, setToast] = useState<{ message: string, type: 'info' | 'error' | 'success' } | null>(null);

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
                background: submitted && status === 'pending' ? 'rgba(5,80,60,0.06)' : cfg.bg,
                border: `1.5px solid ${submitted && status === 'pending' ? 'rgba(5,80,60,0.15)' : cfg.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', zIndex: 1,
              }}>
                {submitted && status === 'pending' ? (
                  <ShieldCheck size={40} color="#05503c" strokeWidth={2} />
                ) : (
                  <Icon size={40} color={cfg.color} strokeWidth={status === 'approved' ? 2.5 : 2} />
                )}
                {(status === 'pending' || submitted) && (
                  <div style={{ position: 'absolute', inset: -3, border: `2px solid ${submitted && status === 'pending' ? 'rgba(5,80,60,0.15)' : cfg.border}`, borderRadius: 27, animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.4 }} />
                )}
              </div>
              <style>{`@keyframes ping { 75%,100% { transform: scale(1.4); opacity: 0; } }`}</style>
            </div>

            <h1 style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.7rem', fontWeight: 800, color: '#05503c', letterSpacing: '-0.03em', marginBottom: '0.5rem', lineHeight: 1.1 }}>
              {submitted && status === 'pending' ? 'Verifying your code with the bank...' : cfg.title}
            </h1>
            <div style={{ marginTop: '1rem' }}>
              {isFailed ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                  <p style={{ color: '#e11d48', fontSize: '0.92rem', lineHeight: 1.6, fontWeight: 600, maxWidth: 320 }}>
                    {status === 'failed' && paymentData?.transaction_code === 'FAIL_LOW_FUNDS' ? 'Check your bank balance.' : ''}
                    {status === 'expired' ? cfg.desc : ''}
                    {status === 'rejected' ? (paymentData?.metadata?.rejection_reason || 'Transaction could not be verified.') : ''}
                    {status === 'failed' && paymentData?.transaction_code !== 'FAIL_LOW_FUNDS' ? cfg.desc : ''}
                  </p>
                  <button
                    onClick={async () => {
                      setToast({ message: 'Resetting payment...', type: 'info' });
                      const res = await resetPaymentStatusAction(paymentId as string);
                      if (res.error) {
                        setToast({ message: res.error, type: 'error' });
                      } else {
                        setStatus('pending');
                        setSubmitted(false);
                        setToast(null);
                      }
                    }}
                    style={{
                      padding: '0.6rem 1.25rem',
                      borderRadius: 12,
                      border: '1px solid rgba(5,80,60,0.1)',
                      background: '#ffffff',
                      color: '#05503c',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <RefreshCw size={14} /> Try Again
                  </button>
                </div>
              ) : (
                <p style={{ color: 'rgba(5,80,60,0.5)', fontSize: '0.92rem', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
                  {submitted && status === 'pending'
                    ? (waitLonger ? 'Bank networks are a bit slow today. Please stay on this page, we are still checking!' : 'Contacting Sheger Pay for confirmation. Please do not close this page.')
                    : cfg.desc}
                </p>
              )}
            </div>
          </div>

          {/* ── Progress Stepper ── */}
          {!isFailed && (
            <div className="anim-row" style={{ padding: '2rem 2.5rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                {/* Line behind steps */}
                <div style={{ position: 'absolute', top: 16, left: 32, right: 32, height: 2, background: 'rgba(5,80,60,0.06)', zIndex: 0 }} />
                <div style={{ position: 'absolute', top: 16, left: 32, height: 2, background: status === 'approved' ? '#059669' : '#fdca00', width: currentStepIdx === 0 ? (submitted ? '25%' : '0%') : currentStepIdx === 1 ? '50%' : '100%', maxWidth: 'calc(100% - 64px)', transition: 'width 1s cubic-bezier(0.4,0,0.2,1)', zIndex: 1 }} />

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

          {/* ── Payment Submission (pending only) ── */}
          {status === 'pending' && !submitted && (
            <div className="anim-row" style={{ padding: '2rem 1.5rem 0' }}>

              {/* 1. Roadmap Instructions */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.1rem', fontWeight: 800, color: '#05503c', marginBottom: '0.75rem' }}>
                  Payment Steps
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[
                    { text: 'Choose your preferred bank (CBE or Telebirr).' },
                    { text: `Transfer ${(paymentData?.total || 0).toLocaleString()} ETB to the account below.` },
                    { text: 'Copy the Transaction ID from your bank app/SMS.' },
                    { text: 'Return here and paste the ID to verify.' }
                  ].map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(5,80,60,0.06)', color: '#05503c', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        {idx + 1}
                      </div>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(5,80,60,0.6)', lineHeight: 1.4 }}>{step.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#faf8f2', border: '1px solid rgba(5,80,60,0.06)', borderRadius: 24, padding: '1.5rem', }}>

                <div style={{ marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    onClick={() => {
                      setPaymentData((prev: any) => ({ ...prev, provider: 'CBE' }));
                    }}
                    style={{
                      padding: '0.75rem', borderRadius: 12,
                      background: (paymentData?.provider || 'CBE') === 'CBE' ? 'rgba(5,150,105,0.1)' : '#ffffff',
                      border: (paymentData?.provider || 'CBE') === 'CBE' ? '1.5px solid #059669' : '1px solid rgba(5,80,60,0.1)',
                      color: (paymentData?.provider || 'CBE') === 'CBE' ? '#059669' : 'rgba(5,80,60,0.5)',
                      fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    CBE Birr
                  </button>
                  <button
                    onClick={() => {
                      setPaymentData((prev: any) => ({ ...prev, provider: 'Telebirr' }));
                    }}
                    style={{
                      padding: '0.75rem', borderRadius: 12,
                      background: paymentData?.provider === 'Telebirr' ? 'rgba(5,150,105,0.1)' : '#ffffff',
                      border: paymentData?.provider === 'Telebirr' ? '1.5px solid #059669' : '1px solid rgba(5,80,60,0.1)',
                      color: paymentData?.provider === 'Telebirr' ? '#059669' : 'rgba(5,80,60,0.5)',
                      fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    Telebirr
                  </button>
                </div>

                {/* 2. Payment Details Component */}
                <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid rgba(253,202,0,0.3)', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 4px 20px rgba(253,202,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(5,80,60,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>Amount to Pay</span>
                    <span style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.2rem', fontWeight: 800, color: '#fdca00' }}>{(paymentData?.total || 0).toLocaleString()} ETB</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(5,80,60,0.02)', padding: '0.75rem 1rem', borderRadius: 12, border: '1px solid rgba(5,80,60,0.05)' }}>
                    <div>
                      <p style={{ fontSize: '0.65rem', color: 'rgba(5,80,60,0.5)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                        {paymentData?.provider === 'Telebirr' ? 'Telebirr' : 'CBE'} Account
                      </p>
                      <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '1.1rem', fontWeight: 800, color: '#05503c' }}>
                        {paymentData?.provider === 'Telebirr' ? '0933527307' : '1000454676436'}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(paymentData?.provider === 'Telebirr' ? '0933527307' : '1000454676436', 'acc')}
                      style={{
                        background: copiedId === 'acc' ? 'rgba(5,150,105,0.1)' : '#ffffff',
                        border: '1px solid rgba(5,80,60,0.1)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 8,
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        color: copiedId === 'acc' ? '#059669' : '#05503c',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', gap: '0.3rem'
                      }}
                    >
                      {copiedId === 'acc' ? <><Check size={12} /> COPIED</> : <><Copy size={12} /> COPY</>}
                    </button>
                  </div>

                  <div style={{ background: 'rgba(5,80,60,0.04)', padding: '0.75rem', borderRadius: 8, marginTop: '1rem', border: '1px solid rgba(5,80,60,0.08)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(5,80,60,0.6)', lineHeight: 1.5 }}>
                      <strong>Tip:</strong> Keep this tab open. After paying in your {paymentData?.provider === 'Telebirr' ? 'Telebirr' : 'CBE'} app, come back to enter your transaction code.
                    </p>
                  </div>
                </div>

                {/* Input Field with Info Tooltip */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(5,80,60,0.5)' }}>
                      Bank Transaction ID <span style={{ color: '#e11d48' }}>*</span>
                    </span>
                    <button onClick={() => setShowGuide(!showGuide)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(5,80,60,0.4)', padding: 2 }}>
                      <Info size={14} />
                    </button>
                  </div>

                  {showGuide && (
                    <div style={{ background: '#ffffff', border: '1px solid rgba(5,80,60,0.1)', borderRadius: 12, padding: '1rem', marginBottom: '1rem', boxShadow: '0 4px 20px rgba(5,80,60,0.05)', fontSize: '0.75rem', color: 'rgba(5,80,60,0.6)', animation: 'fadeIn 0.2s ease' }}>
                      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                      <p style={{ fontWeight: 800, color: '#05503c', marginBottom: '0.5rem' }}>Where to find the code?</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid rgba(5,80,60,0.05)' }}>
                            <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>Telebirr</td>
                            <td style={{ padding: '0.5rem 0' }}>SMS or App History (e.g., <span style={{ fontFamily: 'monospace', color: '#05503c', fontWeight: 700 }}>FT26xxxx</span>)</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(5,80,60,0.05)' }}>
                            <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>CBE Birr</td>
                            <td style={{ padding: '0.5rem 0' }}>'Ref No' in SMS (e.g., <span style={{ fontFamily: 'monospace', color: '#05503c', fontWeight: 700 }}>CGxxxx</span>)</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>CBE Mobile</td>
                            <td style={{ padding: '0.5rem 0' }}>'Transaction ID' in App (e.g., <span style={{ fontFamily: 'monospace', color: '#05503c', fontWeight: 700 }}>8Jxxxx</span>)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="e.g. FT25..."
                    value={paymentData?.input_code || ''}
                    onChange={e => setPaymentData((prev: any) => ({ ...prev, input_code: e.target.value.toUpperCase() }))}
                    style={{
                      width: '100%', padding: '1rem 1.25rem', borderRadius: 16,
                      border: '1.5px solid rgba(5,80,60,0.15)', background: '#ffffff',
                      fontFamily: 'ui-monospace, monospace', fontSize: '1rem', fontWeight: 700,
                      color: '#05503c', outline: 'none',
                    }}
                  />

                  {/* Submit Button with Human Error Handling */}
                  <button
                    onClick={async () => {
                      if (!paymentData?.input_code) return;
                      requestNotificationPermission();
                      setToast({ message: 'Verifying payment...', type: 'info' });
                      setSubmitted(true); // Switch to waiting UI immediately
                      try {
                        const response = await fetch('/api/payments/verify', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            paymentId: paymentData.id,
                            transaction_code: paymentData.input_code,
                            amount: paymentData.total,
                            provider: paymentData.provider || 'CBE'
                          })
                        });
                        const data = await response.json();
                        if (!data.success) throw new Error(data.error);
                        setToast({ message: 'Verification started. Please wait...', type: 'success' });
                      } catch (err: any) {
                        setSubmitted(false); // Revert UI so they can try again
                        let msg = err.message;
                        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('failed')) {
                          msg = "We couldn't find this transaction yet. It can take up to 60 seconds for the bank to sync. Please wait a moment and try again.";
                        } else if (msg.toLowerCase().includes('amount')) {
                          msg = "The transaction was found, but the amount doesn't match your order. Please contact our staff for assistance.";
                        }
                        setToast({ message: msg, type: 'error' });
                      }
                    }}
                    style={{
                      width: '100%', padding: '1rem', marginTop: '1rem', borderRadius: 16,
                      background: '#05503c', color: '#ffffff', border: 'none',
                      fontFamily: 'var(--font-bricolage)', fontSize: '0.9rem', fontWeight: 800,
                      cursor: 'pointer', transition: 'all 0.2s',
                      opacity: paymentData?.input_code ? 1 : 0.5
                    }}
                    disabled={!paymentData?.input_code}
                  >
                    Submit & Verify
                  </button>
                </div>
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

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? '#ef4444' : '#05503c', color: '#fff',
          padding: '0.75rem 1.5rem', borderRadius: '1rem', zIndex: 100,
          fontFamily: 'var(--font-bricolage)', fontWeight: 700, fontSize: '0.85rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          animation: 'slideUp 0.3s ease'
        }}>
          {toast.message}
          <style>{`@keyframes slideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }`}</style>
          {setTimeout(() => setToast(null), 3000) && null}
        </div>
      )}
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
