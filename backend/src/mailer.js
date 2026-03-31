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

