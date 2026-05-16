// lib/shegerpay.ts
export class ShegerPay {
  private secretKey: string;
  private baseUrl = 'https://api.shegerpay.com/v1'; // Verify this in your dashboard

  constructor(secretKey: string) {
    if (!secretKey) throw new Error("Sheger Pay Secret Key is missing.");
    this.secretKey = secretKey;
  }

  async verify(payload: { transaction_code: string; amount: number; provider: string }) {
    // ── Mock Mode for Testing ──
    if (this.secretKey.startsWith('shp_test_') || this.secretKey.startsWith('sk_test_')) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const { transaction_code } = payload;
      // In test mode, we just accept the magic codes as valid submissions
      // The actual status updates (failed, expired, success) will come from the Webhook simulation!
      const testCodes = ['SUCCESS_TEST_CODE', 'FAIL_LOW_FUNDS', 'FAIL_EXPIRED'];
      if (testCodes.some(code => transaction_code.startsWith(code))) {
        return { success: true, message: 'Test code accepted. Awaiting webhook.' };
      }
      
      // If it's a random string in test mode, also accept it to allow normal testing
      return { success: true, message: 'Simulated verification started' };
    }

    // ── Live Mode ──
    const response = await fetch(`${this.baseUrl}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Payment verification failed');
    }

    return await response.json();
  }
}
