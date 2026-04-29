'use server'

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function initiatePaymentAction(sessionId: number) {
  try {
    // 1. Get the session bill
    const { data: billData, error: billError } = await supabaseAdmin.rpc('get_session_bill', {
      p_session_id: sessionId
    });

    if (billError) throw billError;

    // 2. Check for existing payment
    const { data: existingPayment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existingPayment) {
      if (['pending', 'failed', 'rejected'].includes(existingPayment.status)) {
        // Update the existing payment with the latest bill and reset status
        const { data: updatedPayment, error: uError } = await supabaseAdmin
          .from('payments')
          .update({
            subtotal: billData.subtotal || 0,
            vat: billData.vat || 0,
            service_charge: billData.service_charge || billData.service || 0,
            total: billData.total || 0,
            status: 'pending' // Allow user to retry
          })
          .eq('id', existingPayment.id)
          .select()
          .single();

        if (uError) throw uError;

        return { 
          success: true, 
          paymentId: updatedPayment.id,
          transactionCode: updatedPayment.transaction_code,
          amount: updatedPayment.total
        };
      } else {
        // For verified/approved, just return existing data
        return { 
          success: true, 
          paymentId: existingPayment.id,
          transactionCode: existingPayment.transaction_code,
          amount: existingPayment.total
        };
      }
    }

    // 3. Create a new payment record if none exists
    const transactionCode = `SP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const { data: payment, error: pError } = await supabaseAdmin
      .from('payments')
      .insert({
        session_id: sessionId,
        subtotal: billData.subtotal || 0,
        vat: billData.vat || 0,
        service_charge: billData.service_charge || billData.service || 0,
        total: billData.total || 0,
        status: 'pending',
        transaction_code: transactionCode,
        metadata: {
          provider: 'Sheger Pay'
        }
      })
      .select()
      .single();

    if (pError) throw pError;

    return { 
      success: true, 
      paymentId: payment.id,
      transactionCode: transactionCode,
      amount: billData.total
    };
  } catch (error: any) {
    console.error('Payment initiation failed:', error);
    return { error: error.message };
  }
}
