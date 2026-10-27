/**
 * One contract every payment provider implements, so checkout never branches on
 * the provider's name and adding one is a single new file.
 */
export type GatewayCode = "stripe" | "paypal";

export type PaymentMethodCode =
  | "card"
  | "apple_pay"
  | "google_pay"
  | "paypal"
  | "bank_transfer"
  | "cod";

export type StartPaymentInput = {
  orderId: string;
  email: string;
  amountMinor: number;
  currency: string;
  /** Base-currency lines; gateways convert with fxRate. */
  lines: Array<{ name: string; price: number; quantity: number; size: string; color: string; image?: string }>;
  shipping: number;
  taxAmount: number;
  taxLabel: string | null;
  fxRate: number;
  successUrl: string;
  cancelUrl: string;
};

export type StartPaymentResult =
  | { kind: "redirect"; url: string; reference: string }
  | { kind: "deferred"; reference: string; instructions: string | null };

export type RefundInput = {
  orderId: string;
  paymentReference: string;
  amountMinor: number;
  currency: string;
  reason?: string;
};

export type RefundResult =
  | { ok: true; reference: string }
  | { ok: false; reason: string };

/** Normalised webhook event; each gateway adapts its own payload shape. */
export type GatewayEvent =
  | { type: "paid"; orderId: string | null; reference: string | null; amountMinor: number }
  | { type: "failed"; orderId: string | null; reason: string }
  | { type: "refunded"; orderId: string | null; amountMinor: number; reference: string | null }
  | { type: "ignored" };

export interface PaymentGateway {
  readonly code: GatewayCode;
  readonly label: string;
  /** Methods this gateway is capable of, regardless of what's enabled. */
  supports(method: PaymentMethodCode): boolean;
  isConfigured(): boolean;
  start(input: StartPaymentInput): Promise<StartPaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  /** Returns null when the signature/provider is invalid. */
  verifyAndParse(request: Request, rawBody: string): Promise<GatewayEvent | null>;
}
