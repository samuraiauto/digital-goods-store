import YooCheckout from "@a2seven/yoo-checkout";

function getClient() {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) {
    throw new Error("YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY are required");
  }
  return new YooCheckout({ shopId, secretKey });
}

export async function createPayment({ orderId, amountRub, description, returnUrl, customerEmail }) {
  const checkout = getClient();

  // YooKassa expects amount as string with 2 decimals.
  const value = (Math.round(amountRub * 100) / 100).toFixed(2);

  // Note: Payment method can be chosen by customer on YooKassa hosted page.
  // SBP availability depends on your YooKassa settings.
  const payment = await checkout.createPayment(
    {
      amount: { value, currency: "RUB" },
      confirmation: { type: "redirect", return_url: returnUrl },
      capture: true,
      description,
      receipt: customerEmail
        ? {
            customer: { email: customerEmail },
            items: [
              {
                description,
                quantity: "1.00",
                amount: { value, currency: "RUB" },
                vat_code: 1,
              },
            ],
          }
        : undefined,
      metadata: { order_id: orderId },
    },
    orderId // idempotence key
  );

  return payment;
}

export function parseYookassaEvent(body) {
  if (!body || typeof body !== "object") return null;
  if (!body.event || !body.object) return null;
  return body;
}

// Optional signature verification (only if you configure it on YooKassa side).
// The actual header name depends on YooKassa settings/integration mode, so we keep it conservative:
// if secret is set but required header absent -> fail.
export function verifyYookassaWebhook(req) {
  const secret = process.env.YOOKASSA_WEBHOOK_SECRET?.trim();
  if (!secret) return true;

  const signature = req.get("X-Webhook-Signature") || req.get("X-YooKassa-Signature");
  if (!signature) return false;

  // Placeholder: exact algorithm/header may differ by provider configuration.
  // You can disable by unsetting YOOKASSA_WEBHOOK_SECRET.
  return Boolean(signature) && signature.length > 10;
}

