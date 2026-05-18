import { env } from "../../config/env.js";
import { notificationEmailRepository } from "../data/repositories.js";
import type { QuoteResult } from "../pricing/pricing.types.js";

interface OrderEmailInput {
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  deliveryInstructions?: string;
  quote: QuoteResult;
}

export class EmailService {
  private readonly apiUrl = "https://api.brevo.com/v3/smtp/email";
  private readonly senderEmail = "topcoladelivery@nicholsondigitalco.com";

  private async sendBrevoEmail(payload: {
    sender: { name: string; email: string };
    to: Array<{ email: string; name?: string }>;
    cc?: Array<{ email: string; name?: string }>;
    subject: string;
    textContent: string;
    htmlContent: string;
  }): Promise<void> {
    if (!env.BREVO_API_KEY) {
      return;
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": env.BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo send failed (${response.status}): ${body}`);
    }
  }

  async sendOrderNotifications(input: OrderEmailInput): Promise<void> {
    if (!env.BREVO_API_KEY) return;

    const recipients = await notificationEmailRepository.list();
    const activeRecipients = recipients.filter((entry) => entry.is_active);
    if (activeRecipients.length === 0) return;

    const sender = {
      name: "Top Cola Delivery",
      email: this.senderEmail
    };

    const lines = input.quote.items
      .map((item) => `${item.product_name} x${item.quantity} = $${item.line_total.toFixed(2)}`)
      .join("\n");

    const text = [
      `New order received: ${input.orderId}`,
      `Customer: ${input.customerName}`,
      `Phone: ${input.customerPhone}`,
      `Address: ${input.deliveryAddress}`,
      `Instructions: ${input.deliveryInstructions ?? "n/a"}`,
      "",
      "Items:",
      lines,
      "",
      `Subtotal: $${input.quote.subtotal.toFixed(2)}`,
      `Volume discount: -$${input.quote.volumeDiscount.toFixed(2)}`,
      `Promo discount: -$${input.quote.promoDiscount.toFixed(2)}`,
      `Total: $${input.quote.total.toFixed(2)}`
    ].join("\n");

    const html = `<html><body>
      <p><strong>New order received:</strong> ${input.orderId}</p>
      <p><strong>Customer:</strong> ${input.customerName}</p>
      <p><strong>Phone:</strong> ${input.customerPhone}</p>
      <p><strong>Address:</strong> ${input.deliveryAddress}</p>
      <p><strong>Instructions:</strong> ${input.deliveryInstructions ?? "n/a"}</p>
      <p><strong>Items:</strong><br/>${input.quote.items
        .map((item) => `${item.product_name} x${item.quantity} = $${item.line_total.toFixed(2)}`)
        .join("<br/>")}</p>
      <p><strong>Subtotal:</strong> $${input.quote.subtotal.toFixed(2)}<br/>
      <strong>Volume discount:</strong> -$${input.quote.volumeDiscount.toFixed(2)}<br/>
      <strong>Promo discount:</strong> -$${input.quote.promoDiscount.toFixed(2)}<br/>
      <strong>Total:</strong> $${input.quote.total.toFixed(2)}</p>
    </body></html>`;

    await this.sendBrevoEmail({
      sender,
      to: activeRecipients.map((entry) => ({
        email: entry.email,
        ...(entry.name ? { name: entry.name } : {})
      })),
      subject: `New order ${input.orderId}`,
      textContent: text,
      htmlContent: html
    });

    if (input.customerEmail) {
      const customerText = [
        `Thanks for your order ${input.orderId}, ${input.customerName}!`,
        "",
        "Order summary:",
        lines,
        "",
        `Total: $${input.quote.total.toFixed(2)}`,
        "We will contact you shortly with delivery updates."
      ].join("\n");
      const customerHtml = `<html><body>
        <p>Thanks for your order <strong>${input.orderId}</strong>, ${input.customerName}!</p>
        <p><strong>Order summary:</strong><br/>${input.quote.items
          .map((item) => `${item.product_name} x${item.quantity} = $${item.line_total.toFixed(2)}`)
          .join("<br/>")}</p>
        <p><strong>Total:</strong> $${input.quote.total.toFixed(2)}</p>
        <p>We will contact you shortly with delivery updates.</p>
      </body></html>`;

      await this.sendBrevoEmail({
        sender,
        to: [{ email: input.customerEmail, name: input.customerName }],
        cc: activeRecipients.map((entry) => ({
          email: entry.email,
          ...(entry.name ? { name: entry.name } : {})
        })),
        subject: `Order confirmation ${input.orderId}`,
        textContent: customerText,
        htmlContent: customerHtml
      });
    }
  }
}

export const emailService = new EmailService();
