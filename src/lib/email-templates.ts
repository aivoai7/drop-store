import { absolute } from "./site";
import { money } from "./money";

/** Everything users can influence (names, order ids, reasons) gets escaped. */
function esc(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const dark = "#050505";
const lime = "#bef264";

function layout(title: string, body: string) {
  return `<!doctype html>
<html><body style="margin:0;background:${dark};color:#f5f5f5;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-size:18px;font-weight:900;letter-spacing:6px;margin:0 0 28px">DROP</p>
    <h1 style="font-size:26px;text-transform:uppercase;margin:0 0 16px">${title}</h1>
    ${body}
    <p style="margin-top:40px;font-size:11px;color:#888">DROP — thank you for your order.</p>
  </div>
</body></html>`;
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;color:#a3a3a3;font-size:13px">${label}</td>
    <td style="padding:6px 0;text-align:right;font-size:13px">${value}</td>
  </tr>`;
}

export function passwordResetEmail(input: { name: string; token: string }) {
  const url = absolute(`/reset-password?token=${input.token}`);
  return {
    subject: "Reset your DROP password",
    html: layout(
      "Reset your password",
      `<p style="color:#d4d4d4;font-size:14px;line-height:1.6">Hi ${esc(input.name)}, we got a request to reset your password. This link works once and expires in 30 minutes.</p>
       <p style="margin:28px 0"><a href="${url}" style="background:${lime};color:#000;padding:14px 22px;font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:2px;font-size:12px">Set a new password</a></p>
       <p style="color:#888;font-size:12px;line-height:1.6">If you didn't ask for this, ignore the email — your password stays the same.</p>
       <p style="color:#555;font-size:11px;word-break:break-all">${url}</p>`,
    ),
  };
}

export function welcomeEmail(input: { name: string }) {
  return {
    subject: "Welcome to DROP",
    html: layout(
      "You're in",
      `<p style="color:#d4d4d4;font-size:14px;line-height:1.6">Hi ${esc(input.name)}, your account is ready. Orders you place while signed in show up under your account.</p>
       <p style="margin:28px 0"><a href="${absolute("/shop")}" style="background:${lime};color:#000;padding:14px 22px;font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:2px;font-size:12px">Shop the drop</a></p>`,
    ),
  };
}

export function orderConfirmationEmail(input: {
  name: string;
  orderId: string;
  total: number;
  items: Array<{ name: string; size: string; color: string; quantity: number; price: number }>;
}) {
  const rows = input.items
    .map((i) => row(`${esc(i.name)} — ${esc(i.color)} / ${esc(i.size)} ×${i.quantity}`, money(i.price * i.quantity)))
    .join("");
  return {
    subject: `Order ${input.orderId} confirmed`,
    html: layout(
      "Order confirmed",
      `<p style="color:#d4d4d4;font-size:14px;line-height:1.6">Thanks ${esc(input.name)}. We're getting your order ready.</p>
       <p style="font-family:monospace;font-size:13px;color:${lime}">${esc(input.orderId)}</p>
       <table style="width:100%;border-top:1px solid #262626;margin-top:16px">${rows}
         ${row(`<strong>Total</strong>`, `<strong>${money(input.total)}</strong>`)}
       </table>
       <p style="margin:28px 0"><a href="${absolute("/account")}" style="background:${lime};color:#000;padding:14px 22px;font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:2px;font-size:12px">View your orders</a></p>`,
    ),
  };
}

export function shippingEmail(input: {
  name: string;
  orderId: string;
  carrier: string | null;
  trackingNumber: string;
}) {
  return {
    subject: `Order ${input.orderId} is on its way`,
    html: layout(
      "On its way",
      `<p style="color:#d4d4d4;font-size:14px;line-height:1.6">Hi ${esc(input.name)}, your order has shipped.</p>
       <p style="font-family:monospace;font-size:13px;color:${lime}">${esc(input.orderId)}</p>
       <table style="width:100%;border-top:1px solid #262626;margin-top:16px">
         ${input.carrier ? row("Carrier", esc(input.carrier)) : ""}
         ${row("Tracking", esc(input.trackingNumber))}
       </table>
       <p style="margin:28px 0"><a href="${absolute("/account")}" style="background:${lime};color:#000;padding:14px 22px;font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:2px;font-size:12px">View order</a></p>`,
    ),
  };
}

export function refundEmail(input: {
  name: string;
  orderId: string;
  amount: number;
  partial: boolean;
  reason: string | null;
}) {
  return {
    subject: `Refund issued for order ${input.orderId}`,
    html: layout(
      input.partial ? "Partial refund issued" : "Refund issued",
      `<p style="color:#d4d4d4;font-size:14px;line-height:1.6">Hi ${esc(input.name)}, we've refunded your order.</p>
       <p style="font-family:monospace;font-size:13px;color:${lime}">${esc(input.orderId)}</p>
       <table style="width:100%;border-top:1px solid #262626;margin-top:16px">
         ${row("Amount", money(input.amount))}
         ${input.reason ? row("Reason", esc(input.reason)) : ""}
         ${row("Type", input.partial ? "Partial" : "Full")}
       </table>
       <p style="color:#888;font-size:12px;line-height:1.6;margin-top:20px">
         Card refunds usually appear within 5–10 business days, depending on your bank.
       </p>`,
    ),
  };
}

export type EmailTemplate = "password-reset" | "welcome" | "order-confirmation" | "order-shipped" | "refund";
