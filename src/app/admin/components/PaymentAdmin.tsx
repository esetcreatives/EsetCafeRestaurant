'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle, XCircle, Clock, CreditCard, RefreshCw, Printer, AlertCircle, ShieldCheck, Banknote, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import gsap from 'gsap';
import { ReceiptTemplate } from '@/components/admin/ReceiptTemplate';
import { updatePaymentStatusAction } from '../actions';

interface Payment {
  id: string;
  transaction_code: string;
  total: number;
  currency: string;
  status: 'pending' | 'verified' | 'approved' | 'rejected' | 'failed';
  provider: string;
  created_at: string;
  metadata?: any;
  session_id?: number;
  subtotal?: number;
  vat?: number;
  service_charge?: number;
}

interface PrintData {
  order: any;
  payment: any;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: any; label: string }> = {
  pending:  { color: '#b8860b', bg: 'rgba(253,202,0,0.08)', border: 'rgba(253,202,0,0.2)', icon: Clock, label: 'Pending' },
  verified: { color: '#05503c', bg: 'rgba(5,80,60,0.06)', border: 'rgba(5,80,60,0.12)', icon: ShieldCheck, label: 'Verified' },
  approved: { color: '#059669', bg: 'rgba(5,150,105,0.06)', border: 'rgba(5,150,105,0.15)', icon: CheckCircle, label: 'Approved' },
  rejected: { color: '#e11d48', bg: 'rgba(225,29,72,0.05)', border: 'rgba(225,29,72,0.12)', icon: XCircle, label: 'Rejected' },
  failed:   { color: '#e11d48', bg: 'rgba(225,29,72,0.05)', border: 'rgba(225,29,72,0.12)', icon: AlertCircle, label: 'Failed' },
};

export default function PaymentAdmin() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [printData, setPrintData] = useState<PrintData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const copyCode = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    fetchPending();

    const channel = supabase
      .channel('payments-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        fetchPending();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchPending() {
    setLoading(true);
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching payments:', error);
    } else {
      setPayments(data || []);
    }
    setLoading(false);

    setTimeout(() => {
      gsap.fromTo('.payment-card', 
        { opacity: 0, y: 12 }, 
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' }
      );
    }, 50);
  }

  async function updateStatus(id: string, newStatus: 'approved' | 'rejected', reason?: string) {
    setActionLoading(id);
    
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || localStorage.getItem('admin_token') || undefined;

    const result = await updatePaymentStatusAction(id, newStatus, reason, token);

    if (result.error) {
      alert('Failed to update status: ' + result.error);
    } else {
      fetchPending();
    }
    setActionLoading(null);
  }

  async function handleApprove(payment: Payment) {
    const confirmApprove = confirm(`Approve payment ${payment.transaction_code}? This will mark it as paid in the system.`);
    if (!confirmApprove) return;

    setActionLoading(payment.id);
    
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || localStorage.getItem('admin_token') || undefined;

    // 1. Update Payment Status via Server Action (bypasses RLS)
    const result = await updatePaymentStatusAction(payment.id, 'approved', undefined, token);

    if (result.error) {
      alert('Failed to approve payment: ' + result.error);
      setActionLoading(null);
      return;
    }

    // 2. Fetch Session & Orders for Receipt
    if (payment.session_id) {
      const { data: sessionData } = await supabase
        .from('sessions')
        .select(`
          id,
          orders (
            id,
            status,
            order_items (
              quantity,
              unit_price,
              menu_items (name)
            )
          )
        `)
        .eq('id', payment.session_id)
        .single();

      if (sessionData) {
        const formattedOrder = {
          id: sessionData.id.toString(),
          items: sessionData.orders.flatMap((o: any) => 
            o.order_items.map((oi: any) => ({
              id: o.id,
              name: oi.menu_items.name,
              quantity: oi.quantity,
              price: oi.unit_price
            }))
          )
        };
        
        setPrintData({ order: formattedOrder, payment });
        
        setTimeout(() => {
          window.print();
          setPrintData(null);
        }, 500);
      }
    }

    fetchPending();
    setActionLoading(null);
  }

  function handleReject(id: string) {
    const reason = prompt('Please enter a reason for rejection (e.g., "Insufficient amount", "Invalid reference"):');
    if (reason === null) return;
    updateStatus(id, 'rejected', reason || 'No reason provided');
  }

  const filteredPayments = filter === 'all' ? payments : payments.filter(p => p.status === filter);
  const pendingCount = payments.filter(p => p.status === 'pending' || p.status === 'verified').length;

  return (
    <div style={{ fontFamily: 'var(--font-instrument), system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.6rem', fontWeight: 800, color: '#05503c', letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>
            Payment Approvals
          </h2>
          <p style={{ color: 'rgba(5,80,60,0.5)', fontSize: '0.9rem' }}>
            Manage and verify Sheger Pay transactions
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {pendingCount > 0 && (
            <div style={{
              background: 'rgba(253,202,0,0.1)', border: '1px solid rgba(253,202,0,0.2)',
              borderRadius: 12, padding: '0.5rem 0.85rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontSize: '0.78rem', fontWeight: 700, color: '#b8860b',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fdca00', animation: 'pulse 2s infinite' }} />
              {pendingCount} awaiting review
            </div>
          )}
          <button
            onClick={fetchPending}
            disabled={loading}
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: '#ffffff', border: '1px solid rgba(5,80,60,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s', color: '#05503c',
            }}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} style={{ color: 'rgba(5,80,60,0.5)' }} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {['all', 'pending', 'verified', 'approved', 'rejected'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.5rem 1rem', borderRadius: 10,
              border: filter === f ? '1.5px solid #05503c' : '1px solid rgba(5,80,60,0.08)',
              background: filter === f ? '#05503c' : '#ffffff',
              color: filter === f ? '#ffffff' : 'rgba(5,80,60,0.5)',
              fontFamily: 'var(--font-bricolage)', fontWeight: 700,
              fontSize: '0.75rem', textTransform: 'capitalize',
              cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
            }}
          >
            {f === 'all' ? `All (${payments.length})` : `${f} (${payments.filter(p => p.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Payments List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {loading && payments.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '4rem 2rem', background: '#ffffff', borderRadius: 24,
            border: '1px dashed rgba(5,80,60,0.1)',
          }}>
            <RefreshCw size={32} style={{ color: 'rgba(5,80,60,0.15)', marginBottom: '1rem' }} className="animate-spin" />
            <p style={{ color: 'rgba(5,80,60,0.4)', fontWeight: 600 }}>Loading transactions...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '4rem 2rem', background: '#ffffff', borderRadius: 24,
            border: '1px dashed rgba(5,80,60,0.1)',
          }}>
            <CreditCard size={36} style={{ color: 'rgba(5,80,60,0.12)', marginBottom: '1rem' }} />
            <p style={{ color: 'rgba(5,80,60,0.4)', fontWeight: 600 }}>No transactions found</p>
          </div>
        ) : (
          filteredPayments.map((payment) => {
            const cfg = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            const isExpanded = expandedId === payment.id;
            const isActionable = payment.status === 'verified' || payment.status === 'pending';

            return (
              <div
                key={payment.id}
                className="payment-card"
                style={{
                  background: '#ffffff',
                  border: isActionable ? `1.5px solid ${cfg.border}` : '1px solid rgba(5,80,60,0.06)',
                  borderRadius: 24, overflow: 'hidden',
                  boxShadow: isActionable ? `0 8px 32px ${cfg.bg}` : '0 2px 12px rgba(5,80,60,0.03)',
                  transition: 'all 0.3s ease',
                }}
              >
                {/* Main Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : payment.id)}
                  style={{
                    padding: '1.25rem 1.5rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                  }}
                >
                  {/* Left: Status Icon + Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 14,
                      background: cfg.bg, border: `1px solid ${cfg.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <StatusIcon size={20} color={cfg.color} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: '1rem', color: '#05503c', letterSpacing: '-0.01em' }}>
                          {payment.transaction_code}
                        </span>
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                          padding: '0.2rem 0.5rem', borderRadius: 6,
                          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                          letterSpacing: '0.05em',
                        }}>
                          {cfg.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem', fontSize: '0.78rem', color: 'rgba(5,80,60,0.45)' }}>
                        <span style={{ fontWeight: 700, color: '#05503c' }}>
                          {payment.total.toLocaleString()} <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(5,80,60,0.4)' }}>ETB</span>
                        </span>
                        <span style={{ color: 'rgba(5,80,60,0.15)' }}>•</span>
                        <span>{new Date(payment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Expand + Quick Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {isActionable && !isExpanded && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApprove(payment); }}
                        disabled={actionLoading === payment.id}
                        className="btn-primary shimmer-btn"
                        style={{
                          padding: '0.5rem 1rem', borderRadius: 10,
                          fontSize: '0.75rem', fontWeight: 700,
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                          opacity: actionLoading === payment.id ? 0.6 : 1,
                        }}
                      >
                        {actionLoading === payment.id ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                        Approve
                      </button>
                    )}
                    <div style={{ color: 'rgba(5,80,60,0.3)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                      <ChevronDown size={18} />
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{
                    padding: '0 1.5rem 1.5rem',
                    borderTop: '1px solid rgba(5,80,60,0.06)',
                    animation: 'slideDown 0.3s ease',
                  }}>
                    <style>{`@keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 500px; } }`}</style>

                    {/* Details Grid */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '1rem', padding: '1.25rem 0',
                    }}>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(5,80,60,0.35)', marginBottom: 4 }}>Provider</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#05503c' }}>{payment.metadata?.provider || 'Sheger Pay'}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(5,80,60,0.35)', marginBottom: 4 }}>Session ID</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#05503c' }}>{payment.session_id || '—'}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(5,80,60,0.35)', marginBottom: 4 }}>Created</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#05503c' }}>{new Date(payment.created_at).toLocaleString()}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(5,80,60,0.35)', marginBottom: 4 }}>Ref Code</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.85rem', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#fdca00' }}>{payment.transaction_code}</span>
                          <button
                            onClick={() => copyCode(payment.transaction_code, payment.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === payment.id ? '#059669' : 'rgba(5,80,60,0.3)', transition: 'color 0.2s', padding: 2 }}
                          >
                            {copiedId === payment.id ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Bill Breakdown */}
                    <div style={{ background: '#faf8f2', borderRadius: 16, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(5,80,60,0.4)' }}>Subtotal</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#05503c' }}>{(payment.subtotal || 0).toLocaleString()} ETB</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(5,80,60,0.4)' }}>VAT</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#05503c' }}>{(payment.vat || 0).toLocaleString()} ETB</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(5,80,60,0.4)' }}>Service</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#05503c' }}>{(payment.service_charge || 0).toLocaleString()} ETB</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px dashed rgba(5,80,60,0.08)' }}>
                        <span style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.85rem', fontWeight: 800, color: '#05503c' }}>Total</span>
                        <span style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.15rem', fontWeight: 800, color: '#05503c' }}>
                          {payment.total.toLocaleString()} <span style={{ fontSize: '0.65rem', color: 'rgba(5,80,60,0.4)' }}>ETB</span>
                        </span>
                      </div>
                    </div>

                    {/* Rejection reason */}
                    {payment.metadata?.rejection_reason && (
                      <div style={{ background: 'rgba(225,29,72,0.04)', border: '1px solid rgba(225,29,72,0.1)', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <XCircle size={16} color="#e11d48" style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.82rem', color: '#e11d48', fontWeight: 600 }}>{payment.metadata.rejection_reason}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {isActionable && (
                        <>
                          <button
                            onClick={() => handleReject(payment.id)}
                            disabled={actionLoading === payment.id}
                            style={{
                              padding: '0.65rem 1.25rem', borderRadius: 12,
                              border: '1px solid rgba(225,29,72,0.15)', background: 'rgba(225,29,72,0.04)',
                              color: '#e11d48', fontSize: '0.82rem', fontWeight: 700,
                              cursor: 'pointer', transition: 'all 0.2s',
                              opacity: actionLoading === payment.id ? 0.5 : 1,
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                            }}
                          >
                            <XCircle size={15} /> Reject
                          </button>
                          <button
                            onClick={() => handleApprove(payment)}
                            disabled={actionLoading === payment.id}
                            style={{
                              flex: 1, padding: '0.65rem 1.25rem', borderRadius: 12,
                              border: 'none',
                              background: 'linear-gradient(135deg, #05503c, #0a6b51)',
                              color: '#ffffff', fontSize: '0.82rem', fontWeight: 800,
                              cursor: 'pointer', transition: 'all 0.2s',
                              opacity: actionLoading === payment.id ? 0.5 : 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                              boxShadow: '0 6px 24px rgba(5,80,60,0.2)',
                              fontFamily: 'var(--font-bricolage)',
                            }}
                          >
                            {actionLoading === payment.id ? <RefreshCw size={15} className="animate-spin" /> : <Printer size={15} />}
                            Approve & Print Receipt
                          </button>
                        </>
                      )}
                      {payment.status === 'approved' && (
                        <button
                          onClick={() => {
                            setPrintData({ order: { id: payment.session_id?.toString() || '', items: [] }, payment });
                            setTimeout(() => { window.print(); setPrintData(null); }, 500);
                          }}
                          style={{
                            padding: '0.65rem 1.25rem', borderRadius: 12,
                            border: '1px solid rgba(5,80,60,0.08)', background: '#ffffff',
                            color: '#05503c', fontSize: '0.82rem', fontWeight: 700,
                            cursor: 'pointer', transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                          }}
                        >
                          <Printer size={15} /> Re-print Receipt
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Hidden Receipt for Printing */}
      {printData && (
        <div className="hidden print:block">
          <ReceiptTemplate order={printData.order} payment={printData.payment} />
        </div>
      )}
    </div>
  );
}
