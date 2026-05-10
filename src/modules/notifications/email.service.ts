import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import type { QuoteResult } from "../pricing/pricing.types.js";

interface OrderEmailInput {
  orderId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryInstructions?: string;
  quote: QuoteResult;
}

export class EmailService {
  private transporter = !env.SMTP_HOST
    ? null
    : nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: env.SMTP_SECURE ?? false,
        auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
      });

  async sendOrderNotification(input: OrderEmailInput): Promise<void> {
    if (!this.transporter || !env.ORDER_NOTIFICATION_TO || !env.EMAIL_FROM) {
      return;
    }

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

    await this.transporter.sendMail({
      from: env.EMAIL_FROM,
      to: env.ORDER_NOTIFICATION_TO,
      subject: `New order ${input.orderId}`,
      text
    });
  }
}

export const emailService = new EmailService();
