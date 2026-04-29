'use client';

import React from 'react';

interface ReceiptProps {
  order: {
    id: string;
    items: Array<{
      id: string | number;
      name: string;
      quantity: number;
      price: number;
    }>;
  };
  payment: {
    total: number;
    currency: string;
    provider: string;
    transaction_code: string;
    subtotal?: number;
    vat?: number;
    service_charge?: number;
    created_at?: string;
  };
}

export const ReceiptTemplate = ({ order, payment }: ReceiptProps) => {
  const subtotal = payment.subtotal ?? order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const vat = payment.vat ?? subtotal * 0.15;
  const service = payment.service_charge ?? subtotal * 0.10;
  const total = payment.total || subtotal + vat + service;
  const date = payment.created_at ? new Date(payment.created_at) : new Date();

  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  return (
    <div
      id="receipt-print"
      style={{
        width: '80mm',
        margin: '0 auto',
        background: '#ffffff',
        color: '#111111',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '11px',
        lineHeight: '1.5',
        padding: '8mm 5mm',
      }}
      className="print:block hidden"
    >
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: '6mm', paddingBottom: '5mm', borderBottom: '1px dashed #aaaaaa' }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2mm' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: '#05503c',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fdca00', fontWeight: 900, fontSize: 14, fontFamily: 'serif', letterSpacing: '-0.05em' }}>EC</span>
          </div>
        </div>
        <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: '0.15em', textTransform: 'uppercase' }}>ESET CAFE</div>
        <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>Authentic Ethiopian Fusion</div>
        <div style={{ fontSize: 9, color: '#888', marginTop: 1 }}>Addis Ababa, Ethiopia</div>
      </div>

      {/* ── Receipt Info ── */}
      <div style={{ marginBottom: '5mm', paddingBottom: '4mm', borderBottom: '1px dashed #aaaaaa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#555' }}>RECEIPT</span>
          <span style={{ fontWeight: 700 }}>#{order.id.toString().slice(0, 8).toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ color: '#555' }}>DATE</span>
          <span>{dateStr}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ color: '#555' }}>TIME</span>
          <span>{timeStr}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ color: '#555' }}>PAYMENT</span>
          <span style={{ textTransform: 'uppercase' }}>{(payment.provider || 'Sheger Pay')}</span>
        </div>
      </div>

      {/* ── Column Headers ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: 9, color: '#777', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <span style={{ flex: 1 }}>Item</span>
        <span style={{ width: 24, textAlign: 'center' }}>Qty</span>
        <span style={{ width: 48, textAlign: 'right' }}>Amount</span>
      </div>

      {/* ── Items ── */}
      <div style={{ marginBottom: '5mm', paddingBottom: '4mm', borderBottom: '1px dashed #aaaaaa' }}>
        {order.items.length > 0 ? (
          order.items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ flex: 1, paddingRight: 4, wordBreak: 'break-word' }}>{item.name}</span>
              <span style={{ width: 24, textAlign: 'center', color: '#555' }}>{item.quantity}</span>
              <span style={{ width: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {(item.price * item.quantity).toFixed(0)}
              </span>
            </div>
          ))
        ) : (
          <div style={{ color: '#888', textAlign: 'center', padding: '3mm 0' }}>No item details available</div>
        )}
      </div>

      {/* ── Totals ── */}
      <div style={{ marginBottom: '5mm', paddingBottom: '4mm', borderBottom: '1px dashed #aaaaaa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: '#555' }}>
          <span>Subtotal</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{subtotal.toFixed(0)} ETB</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: '#555' }}>
          <span>VAT (15%)</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{vat.toFixed(0)} ETB</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, color: '#555' }}>
          <span>Service (10%)</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{service.toFixed(0)} ETB</span>
        </div>
        {/* Total line */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          paddingTop: '3mm',
          borderTop: '2px solid #111',
          fontWeight: 900, fontSize: 14,
        }}>
          <span>TOTAL</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{total.toFixed(0)} ETB</span>
        </div>
      </div>

      {/* ── Verification ── */}
      <div style={{ marginBottom: '5mm', paddingBottom: '4mm', borderBottom: '1px dashed #aaaaaa', fontSize: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#555' }}>STATUS</span>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ PAID</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#555' }}>PROVIDER</span>
          <span style={{ textTransform: 'uppercase' }}>{(payment.provider || 'Sheger Pay')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#555' }}>REF CODE</span>
          <span style={{ fontWeight: 700, letterSpacing: '0.08em' }}>{payment.transaction_code}</span>
        </div>
      </div>

      {/* ── Barcode-style divider ── */}
      <div style={{ textAlign: 'center', marginBottom: '4mm' }}>
        <div style={{ display: 'inline-flex', gap: 2 }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i % 3 === 0 ? 2 : 1,
                height: i % 5 === 0 ? 14 : 10,
                background: '#111',
                display: 'inline-block',
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 8, color: '#888', marginTop: 2, letterSpacing: '0.2em' }}>
          {payment.transaction_code}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: 'center', fontSize: 9, color: '#777', lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, color: '#333', marginBottom: 1 }}>Thank you for visiting!</div>
        <div>We hope you enjoyed your experience.</div>
        <div style={{ marginTop: 3, color: '#999' }}>@esetcreative &nbsp;·&nbsp; eset.com</div>
      </div>
    </div>
  );
};
