// Интеграция с B2B API поставщика.
// Здесь мы НЕ храним ключи в коде — только через переменные окружения.

import crypto from "node:crypto";

function supplierUrl(pathname) {
  const baseUrl = (process.env.SUPPLIER_BASE_URL || "").trim();
  if (!baseUrl) throw new Error("SUPPLIER_BASE_URL is required");
  const base = baseUrl.replace(/\/+$/, "");
  const path = String(pathname || "");
  const sep = path.startsWith("/") ? "" : "/";
  return base + sep + path;
}

function supplierHeaders() {
  const apiKey = (process.env.SUPPLIER_API_KEY || "").trim();
  if (!apiKey) throw new Error("SUPPLIER_API_KEY is required");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function stripHtml(input) {
  return String(input ?? "")
    .replace(/<script[\\s\\S]*?>[\\s\\S]*?<\\/script>/gi, "")
    .replace(/<style[\\s\\S]*?>[\\s\\S]*?<\\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function mapTypeToCategory(type) {
  const t = String(type ?? "").toLowerCase();
  if (t === "esim") return "esim";
  // voucher / recharge_* / other -> treat as gift cards for now
  return "giftcards";
}

async function fetchJsonOrThrow(url, init) {
  const resp = await fetch(url, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Supplier API error: ${resp.status} ${text}`);
  }
  return await resp.json();
}

async function fetchAllProductsFromCatalog() {
  const categoryId = process.env.SUPPLIER_CATEGORY_ID?.trim();
  const type = process.env.SUPPLIER_TYPE?.trim();
  const includeSkus = process.env.SUPPLIER_INCLUDE_SKUS?.trim() || "true";
  const perPage = Math.min(Number(process.env.SUPPLIER_PER_PAGE ?? 100) || 100, 200);

  let cursor = null;
  const out = [];

  // Cursor pagination
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams();
    qs.set("per_page", String(perPage));
    if (cursor) qs.set("cursor", cursor);
    if (categoryId) qs.set("category_id", categoryId);
    if (type) qs.set("type", type);
    qs.set("include_skus", includeSkus === "true" ? "true" : "false");

    const data = await fetchJsonOrThrow(supplierUrl(`/catalog/products?${qs.toString()}`), {
      method: "GET",
      headers: supplierHeaders(),
    });

    const items = Array.isArray(data?.data) ? data.data : [];
    out.push(...items);

    cursor = data?.meta?.next_cursor ?? null;
    if (!cursor) break;
  }

  return out;
}

async function runWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function fetchSupplierCatalog() {
  // GiftAPI / Partner S2S API:
  // - list:  GET /catalog/products (can include SKUs but WITHOUT pricing)
  // - detail GET /catalog/products/{uuid} (includes SKU pricing + stock)

  const list = await fetchAllProductsFromCatalog();

  const detailConcurrency = Math.max(1, Math.min(Number(process.env.SUPPLIER_DETAIL_CONCURRENCY ?? 6) || 6, 12));

  const detailed = await runWithConcurrency(list, detailConcurrency, async (p) => {
    const productId = String(p?.id ?? "");
    if (!productId) return null;
    const data = await fetchJsonOrThrow(supplierUrl(`/catalog/products/${productId}`), {
      method: "GET",
      headers: supplierHeaders(),
    });
    return data?.data ?? null;
  });

  // Build storefront products as SKU entries (because SKUs have price/stock).
  const products = [];
  for (const pd of detailed.filter(Boolean)) {
    const base = {
      productName: String(pd?.name ?? "").trim(),
      type: pd?.type,
      category: pd?.category,
      description: stripHtml(pd?.description),
      image: String(pd?.image ?? "").trim(),
      attributes: pd?.attributes ?? null,
    };

    const skus = Array.isArray(pd?.skus) ? pd.skus : [];
    for (const sku of skus) {
      const skuId = String(sku?.id ?? "").trim();
      const skuName = String(sku?.name ?? "").trim();
      const price = Number(sku?.price ?? NaN);
      const currency = String(sku?.currency ?? "").trim() || "USD";
      const stock = Number.isFinite(Number(sku?.stock)) ? Number(sku.stock) : 0;
      const maxPerOrder = Number.isFinite(Number(sku?.max_per_order)) ? Number(sku.max_per_order) : 1;

      if (!skuId || !skuName) continue;
      if (!Number.isFinite(price)) continue; // skip custom denomination (price=null)
      if (stock <= 0) continue;

      const mappedCategory = mapTypeToCategory(base.type);

      products.push({
        id: products.length + 1,
        name: skuName,
        category: mappedCategory,
        supplierProductId: skuId, // we sell SKU
        price,
        currency,
        description: base.description || base.productName,
        features: [],
        emoji: mappedCategory === "esim" ? "📶" : "🎁",
        maxPerOrder,
        stock,
      });
    }
  }

  return { products };
}

export async function fulfillFromSupplier(order) {
  const baseUrl = process.env.SUPPLIER_BASE_URL?.trim();
  const apiKey = process.env.SUPPLIER_API_KEY?.trim();
  const secret = process.env.SUPPLIER_SECRET?.trim();

  if (!baseUrl || !apiKey || !secret) {
    // Чтобы вы могли запустить проект до подключения API.
    return {
      mode: "mock",
      message:
        "Поставщик не настроен. Укажите SUPPLIER_BASE_URL, SUPPLIER_API_KEY и SUPPLIER_SECRET в .env и реализуйте запрос в backend/src/supplier.js",
      deliveredItems: order.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        codes: Array.from({ length: it.quantity }, () => "DEMO-CODE-NOT-FOR-PRODUCTION"),
      })),
    };
  }

  // GiftAPI: POST /orders requires:
  // - Authorization: Bearer {token}
  // - X-Timestamp: unix seconds
  // - X-Signature: HMAC-SHA256(timestamp + sku_id + external_id, partner_secret) (hex)
  const deliveredItems = [];

  for (const item of order.items) {
    if (!item.supplierProductId) {
      throw new Error(`supplierProductId (SKU id) missing for item "${item.name}"`);
    }

    const codes = [];
    for (let i = 0; i < item.quantity; i++) {
      const ts = Math.floor(Date.now() / 1000).toString();
      const skuId = String(item.supplierProductId);
      const externalId = `${order.id}-${i + 1}`;
      const message = `${ts}${skuId}${externalId}`;
      const signature = crypto.createHmac("sha256", secret).update(message).digest("hex");

      const data = await fetchJsonOrThrow(supplierUrl("/orders"), {
        method: "POST",
        headers: {
          ...supplierHeaders(),
          "X-Timestamp": ts,
          "X-Signature": signature,
        },
        body: JSON.stringify({
          external_id: externalId,
          item: {
            sku_id: skuId,
            fields: {
              quantity: 1,
              // some products might require extra fields; extend later based on product.fields definitions
            },
          },
          metadata: { customer_email: order.email },
        }),
      });

      const orderData = data?.data;
      const deliveryArr = orderData?.items?.[0]?.delivery_data;
      const deliveryObj = Array.isArray(deliveryArr) ? deliveryArr[0] : null;
      const code =
        deliveryObj?.pin ||
        deliveryObj?.serialNumber ||
        deliveryObj?.serial_number ||
        deliveryObj?.qr_code_text ||
        deliveryObj?.qr_code ||
        null;

      if (!code) throw new Error("Supplier response does not contain delivery data");
      codes.push(String(code));
    }

    deliveredItems.push({
      name: item.name,
      quantity: item.quantity,
      codes,
    });
  }

  return {
    mode: "live",
    deliveredItems,
  };
}

