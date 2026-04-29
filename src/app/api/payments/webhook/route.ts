import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { transaction_code, status, amount } = body;

    console.log('Payment Webhook Received:', { transaction_code, status, amount });

    // Verify the webhook signature here if Sheger Pay provides one
    // for added security to ensure the request came from them.

    const { error } = await supabaseAdmin
      .from('payments')
      .update({ 
        status: status === 'success' ? 'verified' : 'failed',
        metadata: body 
      })
      .eq('transaction_code', transaction_code);

    if (error) {
      console.error('Webhook processing error:', error);
      throw error;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error('Webhook error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
