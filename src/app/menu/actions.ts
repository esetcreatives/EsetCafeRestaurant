'use server'

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function initiatePaymentAction(sessionId: number) {
  try {
    // 1. Get the session bill (now includes total_paid and remaining)
    const { data: billData, error: billError } = await supabaseAdmin.rpc('get_session_bill', {
      p_session_id: sessionId
    });

    if (billError) throw billError;

    // Use remaining balance for the payment amount (running-tab model)
    const amountDue = billData.remaining || billData.total;
    
    if (amountDue <= 0) {
      return { error: 'No outstanding balance for this session.' };
    }

    // 2. Check for existing payment
    const { data: existingPayment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('session_id', sessionId)
      .in('status', ['pending', 'failed', 'rejected', 'verified'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPayment) {
      if (['pending', 'failed', 'rejected'].includes(existingPayment.status)) {
        // Update the existing payment with the latest remaining balance and reset status
        const { data: updatedPayment, error: uError } = await supabaseAdmin
          .from('payments')
          .update({
            subtotal: billData.subtotal || 0,
            vat: billData.vat || 0,
            service_charge: billData.service_charge || billData.service || 0,
            total: amountDue,
            status: 'pending', // Allow user to retry
            payment_method: 'mobile'
          })
          .eq('id', existingPayment.id)
          .select()
          .single();

        if (uError) throw uError;

        return { 
          success: true, 
          paymentId: updatedPayment.id,
          transactionCode: updatedPayment.transaction_code,
          amount: amountDue,
          totalBill: billData.total,
          totalPaid: billData.total_paid || 0,
          remaining: amountDue
        };
      } else if (existingPayment.status === 'verified') {
        // Already verified, just return the data
        return { 
          success: true, 
          paymentId: existingPayment.id,
          transactionCode: existingPayment.transaction_code,
          amount: existingPayment.total,
          totalBill: billData.total,
          totalPaid: billData.total_paid || 0,
          remaining: amountDue
        };
      }
    }

    // 3. Create a new payment record for the remaining balance
    const transactionCode = `SP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const { data: payment, error: pError } = await supabaseAdmin
      .from('payments')
      .insert({
        session_id: sessionId,
        subtotal: billData.subtotal || 0,
        vat: billData.vat || 0,
        service_charge: billData.service_charge || billData.service || 0,
        total: amountDue,
        status: 'pending',
        transaction_code: transactionCode,
        payment_method: 'mobile',
        metadata: {
          provider: 'Sheger Pay',
          total_bill: billData.total,
          prior_paid: billData.total_paid || 0
        }
      })
      .select()
      .single();

    if (pError) throw pError;

    return { 
      success: true, 
      paymentId: payment.id,
      transactionCode: transactionCode,
      amount: amountDue,
      totalBill: billData.total,
      totalPaid: billData.total_paid || 0,
      remaining: amountDue
    };
  } catch (error: any) {
    console.error('Payment initiation failed:', error);
    return { error: error.message };
  }
}

/**
 * Fetch the session accounting summary for the "Difference" display.
 * Returns { total_bill, total_paid, remaining, orders_count }
 */
export async function getSessionSummaryAction(sessionId: number) {
  try {
    const { data: billData, error: billError } = await supabaseAdmin.rpc('get_session_bill', {
      p_session_id: sessionId
    });

    if (billError) throw billError;

    // Count non-cancelled orders
    const { count } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .neq('status', 'cancelled');

    return {
      success: true,
      data: {
        subtotal: billData.subtotal || 0,
        vat: billData.vat || 0,
        service_charge: billData.service_charge || 0,
        total_bill: billData.total || 0,
        total_paid: billData.total_paid || 0,
        remaining: billData.remaining || 0,
        orders_count: count || 0
      }
    };
  } catch (error: any) {
    console.error('Session summary failed:', error);
    return { error: error.message };
  }
}
