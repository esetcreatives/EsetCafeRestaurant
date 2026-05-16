'use server'

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function resetPaymentStatusAction(paymentId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('payments')
      .update({ status: 'pending', transaction_code: null })
      .eq('id', paymentId);
      
    if (error) throw error;
    
    return { success: true };
  } catch (err: any) {
    console.error('Reset Payment Error:', err);
    return { error: err.message || 'Failed to reset payment status' };
  }
}
