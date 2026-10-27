import type { PaymentGateway, PaymentMethodCode } from "./types";
import { stripeGateway } from "./stripe-gateway";
import { paypalGateway } from "./paypal-gateway";

export const gateways: PaymentGateway[] = [stripeGateway, paypalGateway];

/** The configured gateway that can handle this method, preferring the first. */
export function gatewayFor(method: PaymentMethodCode): PaymentGateway | null {
  return gateways.find((g) => g.supports(method) && g.isConfigured()) ?? null;
}

export function gatewayByCode(code: string): PaymentGateway | null {
  return gateways.find((g) => g.code === code) ?? null;
}

export type { PaymentGateway, PaymentMethodCode } from "./types";
