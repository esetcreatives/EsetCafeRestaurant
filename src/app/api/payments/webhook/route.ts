import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  const signature = req.headers.get('x-sheger-signature') || req.headers.get('X-ShegerPay-Signature');
  const secret = process.env.SHEGERPAY_WEBHOOK_SECRET!;

  try {
    // 1. Get the raw body string (Crucial: Do not use req.json() first)
    const rawBody = await req.text();

    // 2. Calculate the expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // 3. Security Check: Constant-time comparison to prevent timing attacks
    const isDev = process.env.NODE_ENV === 'development';
    const hasValidSignature = signature && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!hasValidSignature && !isDev) {
      console.error('Invalid Sheger Pay signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 4. If verified, parse the body and update Supabase
    const body = JSON.parse(rawBody);
    const { transaction_code, status } = body;

    console.log('Verified Webhook Received:', { transaction_code, status });

    const newStatus = status === 'success' ? 'verified' : (status === 'expired' ? 'expired' : 'failed');

    const { data: updatedPayment, error } = await supabaseAdmin
      .from('payments')
      .update({ 
        status: newStatus,
        metadata: body,
        payment_method: 'mobile' 
      })
      .eq('transaction_code', transaction_code)
      .select('id, session_id, total')
      .single();

    if (error) throw error;

    // 5. If payment verified successfully, update session accounting
    //    This makes pay_first orders visible to the kitchen via Realtime
    if (newStatus === 'verified' && updatedPayment?.session_id) {
      const sessionId = updatedPayment.session_id;

      // Recalculate session bill to sync accounting
      await supabaseAdmin.rpc('get_session_bill', {
        p_session_id: sessionId
      });

      console.log(`Payment verified for session ${sessionId} — pay_first orders are now kitchen-visible`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
