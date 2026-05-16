'use client';

import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info, X, AlertOctagon } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────
type DialogVariant = 'confirm' | 'alert' | 'prompt' | 'destructive';

interface DialogOptions {
  title: string;
  message: string;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  /** For prompt dialogs: the placeholder text */
  placeholder?: string;
  /** For prompt dialogs: the expected exact match to enable confirmation */
  requiredMatch?: string;
  /** For prompt dialogs: the default value in the input */
  defaultValue?: string;
}

interface DialogState extends DialogOptions {
  resolve: (value: string | boolean | null) => void;
}

interface DialogContextType {
  /** Shows a confirmation dialog. Returns true if confirmed, false if cancelled. */
  showConfirm: (title: string, message: string, opts?: Partial<DialogOptions>) => Promise<boolean>;
  /** Shows an alert dialog. Resolves when user dismisses. */
  showAlert: (title: string, message: string, opts?: Partial<DialogOptions>) => Promise<void>;
  /** Shows a prompt dialog. Returns the input value, or null if cancelled. */
  showPrompt: (title: string, message: string, opts?: Partial<DialogOptions>) => Promise<string | null>;
  /** Shows a destructive confirmation dialog (red styling). Returns true if confirmed. */
  showDestructive: (title: string, message: string, opts?: Partial<DialogOptions>) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a <DialogProvider>');
  return ctx;
}

// ─── Variant config ────────────────────────────────────────────────
const VARIANT_CONFIG: Record<DialogVariant, { icon: any; iconColor: string; iconBg: string; confirmBg: string; confirmHover: string }> = {
  confirm: {
    icon: Info,
    iconColor: '#05503c',
    iconBg: 'rgba(5,80,60,0.08)',
    confirmBg: 'linear-gradient(135deg, #05503c, #0a6b51)',
    confirmHover: '#0a6b51',
  },
  alert: {
    icon: CheckCircle,
    iconColor: '#fdca00',
    iconBg: 'rgba(253,202,0,0.1)',
    confirmBg: '#05503c',
    confirmHover: '#0a6b51',
  },
  prompt: {
    icon: Info,
    iconColor: '#05503c',
    iconBg: 'rgba(5,80,60,0.08)',
    confirmBg: 'linear-gradient(135deg, #05503c, #0a6b51)',
    confirmHover: '#0a6b51',
  },
  destructive: {
    icon: AlertOctagon,
    iconColor: '#ef4444',
    iconBg: 'rgba(239,68,68,0.08)',
    confirmBg: 'linear-gradient(135deg, #dc2626, #ef4444)',
    confirmHover: '#b91c1c',
  },
};

// ─── Provider ───────────────────────────────────────────────────────
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // When a new dialog opens, animate in
  useEffect(() => {
    if (dialog) {
      setPromptValue(dialog.defaultValue || '');
      requestAnimationFrame(() => setVisible(true));
      // Auto-focus input for prompt dialogs
      if (dialog.variant === 'prompt') {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [dialog]);

  const dismiss = useCallback((result: string | boolean | null) => {
    setVisible(false);
    setTimeout(() => {
      dialog?.resolve(result);
      setDialog(null);
      setPromptValue('');
    }, 250);
  }, [dialog]);

  const showConfirm = useCallback((title: string, message: string, opts?: Partial<DialogOptions>): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        title,
        message,
        variant: 'confirm',
        confirmLabel: opts?.confirmLabel || 'Confirm',
        cancelLabel: opts?.cancelLabel || 'Cancel',
        ...opts,
        resolve: resolve as any,
      });
    });
  }, []);

  const showAlert = useCallback((title: string, message: string, opts?: Partial<DialogOptions>): Promise<void> => {
    return new Promise((resolve) => {
      setDialog({
        title,
        message,
        variant: 'alert',
        confirmLabel: opts?.confirmLabel || 'OK',
        ...opts,
        resolve: () => resolve(),
      });
    });
  }, []);

  const showPrompt = useCallback((title: string, message: string, opts?: Partial<DialogOptions>): Promise<string | null> => {
    return new Promise((resolve) => {
      setDialog({
        title,
        message,
        variant: 'prompt',
        confirmLabel: opts?.confirmLabel || 'Submit',
        cancelLabel: opts?.cancelLabel || 'Cancel',
        ...opts,
        resolve: resolve as any,
      });
    });
  }, []);

  const showDestructive = useCallback((title: string, message: string, opts?: Partial<DialogOptions>): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        title,
        message,
        variant: 'destructive',
        confirmLabel: opts?.confirmLabel || 'Delete',
        cancelLabel: opts?.cancelLabel || 'Cancel',
        ...opts,
        resolve: resolve as any,
      });
    });
  }, []);

  const handleConfirm = () => {
    if (dialog?.variant === 'prompt') {
      dismiss(promptValue || null);
    } else if (dialog?.variant === 'alert') {
      dismiss(true);
    } else {
      dismiss(true);
    }
  };

  const handleCancel = () => {
    if (dialog?.variant === 'prompt') {
      dismiss(null);
    } else {
      dismiss(false);
    }
  };

  const cfg = dialog ? VARIANT_CONFIG[dialog.variant || 'confirm'] : VARIANT_CONFIG.confirm;
  const Icon = cfg.icon;
  const isPromptValid = dialog?.variant === 'prompt' && dialog.requiredMatch 
    ? promptValue === dialog.requiredMatch 
    : true;

  return (
    <DialogContext.Provider value={{ showConfirm, showAlert, showPrompt, showDestructive }}>
      {children}

      {dialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
            background: visible ? 'rgba(5,80,60,0.25)' : 'rgba(5,80,60,0)',
            backdropFilter: visible ? 'blur(12px)' : 'blur(0)',
            WebkitBackdropFilter: visible ? 'blur(12px)' : 'blur(0)',
            transition: 'background 0.25s ease, backdrop-filter 0.25s ease',
          }}
          onClick={handleCancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: 'min(100%, 420px)',
              background: '#ffffff',
              borderRadius: 28,
              boxShadow: '0 25px 80px rgba(5,80,60,0.18)',
              overflow: 'hidden',
              transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(12px)',
              opacity: visible ? 1 : 0,
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
            }}
          >
            {/* Close button */}
            <button
              onClick={handleCancel}
              style={{
                position: 'absolute', top: '1rem', right: '1rem', zIndex: 2,
                width: 32, height: 32, borderRadius: 10,
                background: 'rgba(5,80,60,0.04)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'rgba(5,80,60,0.3)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(5,80,60,0.08)'; e.currentTarget.style.color = '#05503c'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(5,80,60,0.04)'; e.currentTarget.style.color = 'rgba(5,80,60,0.3)'; }}
            >
              <X size={16} />
            </button>

            <div style={{ padding: '2.5rem 2rem 2rem', textAlign: 'center' }}>
              {/* Icon */}
              <div style={{
                width: 56, height: 56, borderRadius: 18,
                background: cfg.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}>
                <Icon size={28} color={cfg.iconColor} />
              </div>

              {/* Title */}
              <h3 style={{
                fontFamily: 'var(--font-bricolage, system-ui)',
                fontWeight: 800, fontSize: '1.25rem',
                color: '#05503c', letterSpacing: '-0.02em',
                marginBottom: '0.75rem',
              }}>
                {dialog.title}
              </h3>

              {/* Message */}
              <p style={{
                fontSize: '0.9rem', color: 'rgba(5,80,60,0.55)',
                lineHeight: 1.6, marginBottom: '1.75rem',
                whiteSpace: 'pre-line',
              }}>
                {dialog.message}
              </p>

              {/* Prompt Input */}
              {dialog.variant === 'prompt' && (
                <input
                  ref={inputRef}
                  type="text"
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && isPromptValid) handleConfirm(); }}
                  placeholder={dialog.placeholder || 'Type here...'}
                  style={{
                    width: '100%', padding: '0.9rem 1.1rem',
                    borderRadius: 14,
                    border: dialog.requiredMatch && promptValue && promptValue !== dialog.requiredMatch
                      ? '1.5px solid rgba(239,68,68,0.3)'
                      : '1.5px solid rgba(5,80,60,0.1)',
                    background: '#fafafa',
                    fontSize: '1rem', fontWeight: 700,
                    fontFamily: 'var(--font-bricolage, system-ui)',
                    color: '#05503c',
                    textAlign: 'center',
                    outline: 'none',
                    marginBottom: '1.5rem',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#fdca00'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(5,80,60,0.1)'; }}
                />
              )}

              {/* Actions */}
              <div style={{
                display: 'flex', gap: '0.75rem',
                flexDirection: dialog.variant === 'alert' ? 'column' : 'row',
              }}>
                {dialog.variant !== 'alert' && (
                  <button
                    onClick={handleCancel}
                    style={{
                      flex: 1, padding: '0.9rem 1.25rem',
                      borderRadius: 16,
                      background: 'rgba(5,80,60,0.04)',
                      border: '1px solid rgba(5,80,60,0.08)',
                      color: '#05503c',
                      fontFamily: 'var(--font-bricolage, system-ui)',
                      fontWeight: 700, fontSize: '0.9rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(5,80,60,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(5,80,60,0.04)'; }}
                  >
                    {dialog.cancelLabel || 'Cancel'}
                  </button>
                )}
                <button
                  onClick={handleConfirm}
                  disabled={!isPromptValid}
                  style={{
                    flex: 1, padding: '0.9rem 1.25rem',
                    borderRadius: 16,
                    background: cfg.confirmBg,
                    border: 'none',
                    color: '#ffffff',
                    fontFamily: 'var(--font-bricolage, system-ui)',
                    fontWeight: 800, fontSize: '0.9rem',
                    cursor: isPromptValid ? 'pointer' : 'not-allowed',
                    opacity: isPromptValid ? 1 : 0.5,
                    boxShadow: dialog.variant === 'destructive'
                      ? '0 8px 24px rgba(239,68,68,0.2)'
                      : '0 8px 24px rgba(5,80,60,0.15)',
                    transition: 'all 0.2s',
                  }}
                >
                  {dialog.confirmLabel || 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
