import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST/SMTP_USER/SMTP_PASS are required");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendDigitalGoodsEmail({ to, orderId, items, fulfillment }) {
  const from = process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim();
  if (!from) throw new Error("MAIL_FROM (or SMTP_USER) is required");

  const transport = getTransport();

  const lines = [];
  lines.push(`Спасибо за оплату! Ваш заказ: ${orderId}`);
  lines.push("");
  lines.push("Состав заказа:");
  for (const it of items) {
    lines.push(`- ${it.name} × ${it.quantity}`);
  }
  lines.push("");
  lines.push("Коды/ключи:");

  for (const di of fulfillment?.deliveredItems ?? []) {
    lines.push("");
    lines.push(`${di.name}:`);
    for (const code of di.codes ?? []) {
      lines.push(`- ${code}`);
    }
  }

  lines.push("");
  lines.push("Если письмо пришло без кодов — ответьте на это сообщение, мы поможем.");

  await transport.sendMail({
    from,
    to,
    subject: `Ваш цифровой товар — заказ ${orderId}`,
    text: lines.join("\n"),
  });
}

function formatMoneyLine(item) {
  const q = Number(item?.quantity ?? 0);
  const p = Number(item?.price ?? 0);
  const cur = String(item?.currency ?? "RUB").toUpperCase();
  const sub = Number.isFinite(p) && Number.isFinite(q) ? p * q : NaN;
  const subStr = Number.isFinite(sub) ? `${sub} ${cur}` : "";
  return `- ${item.name} × ${q}${subStr ? ` — ${subStr}` : ""}`;
}

export async function sendOrderRequestEmails({ orderId, customerEmail, phone, items, totalLabel, note }) {
  const notifyTo = process.env.ORDER_NOTIFY_EMAIL?.trim();
  if (!notifyTo) throw new Error("ORDER_NOTIFY_EMAIL is required");

  const from = process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim();
  if (!from) throw new Error("MAIL_FROM (or SMTP_USER) is required");

  const transport = getTransport();

  const adminLines = [];
  adminLines.push(`Новая заявка: ${orderId}`);
  adminLines.push(`Email клиента: ${customerEmail}`);
  if (phone) adminLines.push(`Телефон / мессенджер: ${phone}`);
  if (note) adminLines.push(`Комментарий: ${note}`);
  adminLines.push("");
  adminLines.push("Состав:");
  for (const it of items) adminLines.push(formatMoneyLine(it));
  adminLines.push("");
  adminLines.push(`Итого (ориентир): ${totalLabel}`);

  await transport.sendMail({
    from,
    to: notifyTo,
    subject: `Новая заявка ${orderId}`,
    text: adminLines.join("\n"),
  });

  const sendConfirm = process.env.ORDER_SEND_CUSTOMER_CONFIRM?.trim() !== "false";
  if (!sendConfirm) return;

  const clines = [];
  clines.push("Спасибо за заявку!");
  clines.push("");
  clines.push(`Номер заявки: ${orderId}`);
  clines.push(`Состав:`);
  for (const it of items) clines.push(formatMoneyLine(it));
  clines.push("");
  clines.push(`Итого (ориентир): ${totalLabel}`);
  clines.push("");
  clines.push("Дальше мы свяжемся с вами и отправим реквизиты для оплаты переводом.");
  clines.push("После получения оплаты отправим цифровой товар на указанный email.");

  await transport.sendMail({
    from,
    to: customerEmail,
    subject: `Заявка принята — ${orderId}`,
    text: clines.join("\n"),
  });
}

