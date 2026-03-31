import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { createPayment, parseYookassaEvent, verifyYookassaWebhook } from "./yookassa.js";
import { fetchSupplierCatalog, fulfillFromSupplier } from "./supplier.js";
import { sendDigitalGoodsEmail } from "./mailer.js";
import { ordersStore } from "./store.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Всегда грузим backend/.env, даже если процесс запущен не из каталога backend/.
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const siteRoot = path.resolve(__dirname, "..", "..");

app.use(express.static(siteRoot));

app.use("/api", express.json({ limit: "1mb" }));

// Simple CORS for API (useful when frontend is on GitHub Pages).
app.use("/api", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.PUBLIC_ORIGIN?.trim() || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/catalog", async (_req, res) => {
  try {
    const catalog = await fetchSupplierCatalog();
    res.json(catalog);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "CATALOG_FAILED" });
  }
});

function requireAdmin(req, res) {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) return res.status(503).json({ error: "ADMIN_DISABLED" });
  const auth = req.get("Authorization") || "";
  if (auth !== `Bearer ${token}`) return res.status(401).json({ error: "UNAUTHORIZED" });
  return null;
}

// Test endpoint: sends a delivery email without payment/provider.
// Useful to validate SMTP + email templates quickly.
app.post("/api/admin/test-email", async (req, res) => {
  const denied = requireAdmin(req, res);
  if (denied) return;
  try {
    const email = String(req.body?.email || "").trim();
    if (!email || !email.includes("@")) return res.status(400).json({ error: "EMAIL_REQUIRED" });

    const orderId = `test-${crypto.randomUUID()}`;
    const order = {
      id: orderId,
      email,
      items: [
        {
          id: "test-item",
          name: "Тестовый цифровой товар",
          price: 1,
          quantity: 1,
          supplierProductId: null,
        },
      ],
      total: 1,
      status: "test",
      createdAt: new Date().toISOString(),
    };

    // Force mock mode by not calling supplier at all.
    const fulfillment = {
      mode: "mock",
      deliveredItems: [
        {
          name: order.items[0].name,
          quantity: 1,
          codes: ["DEMO-CODE-NOT-FOR-PRODUCTION"],
        },
      ],
    };

    await sendDigitalGoodsEmail({
      to: order.email,
      orderId,
      items: order.items,
      fulfillment,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "TEST_EMAIL_FAILED" });
  }
});

app.post("/api/create-payment", async (req, res) => {
  try {
    const { email, items } = req.body ?? {};

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "EMAIL_REQUIRED" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "ITEMS_REQUIRED" });
    }

    // items: [{ id, name, price, quantity, supplierProductId }]
    const normalizedItems = items
      .map((it) => ({
        id: it?.id,
        name: String(it?.name ?? ""),
        price: Number(it?.price ?? 0),
        quantity: Number(it?.quantity ?? 0),
        supplierProductId: it?.supplierProductId ? String(it.supplierProductId) : null,
      }))
      .filter((it) => it.name && it.price > 0 && it.quantity > 0);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "INVALID_ITEMS" });
    }

    const total = normalizedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "INVALID_TOTAL" });
    }

    const orderId = crypto.randomUUID();
    await ordersStore.create({
      id: orderId,
      email,
      items: normalizedItems,
      total,
      status: "created",
      createdAt: new Date().toISOString(),
    });

    const confirmationReturnUrl =
      process.env.PUBLIC_RETURN_URL?.trim() || "http://localhost:3000/success.html";

    const payment = await createPayment({
      orderId,
      amountRub: total,
      description: `Заказ ${orderId}`,
      returnUrl: confirmationReturnUrl,
      customerEmail: email,
    });

    await ordersStore.update(orderId, {
      status: "payment_created",
      yookassaPaymentId: payment.id,
    });

    res.json({
      orderId,
      paymentId: payment.id,
      confirmationUrl: payment.confirmation?.confirmation_url,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "CREATE_PAYMENT_FAILED" });
  }
});

// YooKassa webhooks are posted as JSON.
app.post("/api/yookassa/webhook", express.json({ type: "*/*" }), async (req, res) => {
  try {
    if (process.env.YOOKASSA_WEBHOOK_SECRET) {
      const ok = verifyYookassaWebhook(req);
      if (!ok) return res.status(401).send("invalid signature");
    }

    const event = parseYookassaEvent(req.body);
    if (!event) return res.status(400).send("bad event");

    const paymentId = event.object?.id;
    const orderId = event.object?.metadata?.order_id;

    if (!paymentId || !orderId) return res.status(200).send("ignored");

    const order = await ordersStore.get(orderId);
    if (!order) return res.status(200).send("unknown order");

    // Idempotency: if already fulfilled, do nothing.
    if (order.status === "fulfilled") return res.status(200).send("ok");

    const eventType = event.event;

    if (eventType === "payment.succeeded") {
      await ordersStore.update(orderId, { status: "paid" });

      const fulfillment = await fulfillFromSupplier(order);
      await ordersStore.update(orderId, { status: "fulfilled", fulfillment });

      await sendDigitalGoodsEmail({
        to: order.email,
        orderId,
        items: order.items,
        fulfillment,
      });
    }

    res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    // Return 200 to avoid endless retries if fulfillment fails;
    // you can re-process via a future admin endpoint.
    res.status(200).send("ok");
  }
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.LISTEN_HOST?.trim() || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`);
});

