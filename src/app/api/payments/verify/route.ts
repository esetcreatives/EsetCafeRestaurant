import { ShegerPay } from '@/lib/shegerpay';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// The SDK automatically handles the Test/Live environment 
// based on the prefix of your secret key (shp_test_ vs shp_live_)
export async function POST(req: Request) {
  try {
    const sheger = new ShegerPay(process.env.SHEGERPAY_SECRET_KEY!);
    const { transaction_code, amount, provider, paymentId } = await req.json();

    if (!paymentId) throw new Error("Payment ID is required");

    // 1. Update the payment record with the user's transaction code & provider
    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update({ 
        transaction_code, 
        metadata: { provider },
        payment_method: 'mobile'
      })
      .eq('id', paymentId);

    if (updateError) {
      if (updateError.code === '23505') {
        throw new Error("This transaction has already been used.");
      }
      throw updateError;
    }

    // 2. Initial check with Sheger Pay
    const verification = await sheger.verify({
      transaction_code,
      amount,
      provider
    });

    // We don't mark it as verified here; we wait for the Webhook.
    // The verify route simply validates that the code format/initial check is okay.
    return NextResponse.json({ 
      success: true,
      message: 'Verification started',
      data: verification 
    });
  } catch (error: any) {
    console.error('Sheger Pay Verification Error:', error);
    return NextResponse.json({ success: false, error: error.message || "Verification failed" }, { status: 400 });
  }
}

