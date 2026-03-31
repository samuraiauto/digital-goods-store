import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { fetchSupplierCatalog } from "./supplier.js";
import { sendDigitalGoodsEmail, sendOrderRequestEmails } from "./mailer.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const siteRoot = path.resolve(__dirname, "..", "..");

app.use(express.static(siteRoot));

app.use("/api", express.json({ limit: "1mb" }));

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

function totalLabelFromItems(items) {
  const sums = {};
  for (const it of items) {
    const cur = String(it.currency || "RUB").toUpperCase();
    const p = Number(it.price);
    const q = Number(it.quantity);
    if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
    sums[cur] = (sums[cur] || 0) + p * q;
  }
  const parts = Object.entries(sums).map(([c, s]) => `${s} ${c}`);
  return parts.length ? parts.join(", ") : "—";
}

/** Заявка без онлайн‑оплаты: письмо администратору (+ опционально клиенту). */
app.post("/api/order-request", async (req, res) => {
  try {
    const { email, items, phone, note } = req.body ?? {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "EMAIL_REQUIRED" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "ITEMS_REQUIRED" });
    }

    const normalizedItems = items
      .map((it) => ({
        id: it?.id,
        name: String(it?.name ?? ""),
        price: Number(it?.price ?? 0),
        quantity: Number(it?.quantity ?? 0),
        currency: String(it?.currency ?? "RUB").trim() || "RUB",
        supplierProductId: it?.supplierProductId ? String(it.supplierProductId) : null,
      }))
      .filter((it) => it.name && it.price > 0 && it.quantity > 0);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "INVALID_ITEMS" });
    }

    const noteStr = typeof note === "string" ? note.trim().slice(0, 2000) : "";
    const phoneStr = typeof phone === "string" ? phone.trim().slice(0, 80) : "";

    const orderId = crypto.randomUUID();
    const label = totalLabelFromItems(normalizedItems);

    await sendOrderRequestEmails({
      orderId,
      customerEmail: email.trim(),
      phone: phoneStr || undefined,
      items: normalizedItems,
      totalLabel: label,
      note: noteStr || undefined,
    });

    res.json({ ok: true, orderId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ORDER_REQUEST_FAILED" });
  }
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.LISTEN_HOST?.trim() || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`);
});
