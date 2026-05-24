import {
  ContentTypeId,
  type ContentCodec,
  type EncodedContent,
} from '@xmtp/content-type-primitives';

const AUTHORITY = 'embedded-miniapp-boilerplate';
export const APP_ID = `${AUTHORITY}@1.0`;

export const ContentTypePaymentRequest: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'payment-request',
  versionMajor: 1,
  versionMinor: 0,
};

export interface PaymentRequest {
  kind: 'payment-request';
  appId: string;
  requestId: string;
  requester: string;
  payer: string;
  amount: string;
  symbol: string;
  message?: string;
  mode: 'request' | 'split';
  ts: number;
}

function eq(a: ContentTypeId, b: ContentTypeId): boolean {
  return a.authorityId === b.authorityId && a.typeId === b.typeId;
}

export function isPaymentRequestContent(t: ContentTypeId | undefined): boolean {
  return !!t && eq(t, ContentTypePaymentRequest);
}

function jsonCodec<T>(contentType: ContentTypeId): ContentCodec<T> {
  return {
    contentType,
    encode(content: T): EncodedContent {
      return {
        type: contentType,
        parameters: {},
        content: new TextEncoder().encode(JSON.stringify(content)),
      };
    },
    decode(encoded: EncodedContent): T {
      return JSON.parse(new TextDecoder().decode(encoded.content)) as T;
    },
    fallback(content: T): string | undefined {
      const c = content as { kind?: string };
      return `[${c.kind ?? contentType.typeId}]`;
    },
    shouldPush: () => true,
  };
}

export const paymentRequestCodec: ContentCodec<PaymentRequest> =
  jsonCodec<PaymentRequest>(ContentTypePaymentRequest);

// ── Payment Confirmation ─────────────────────────────────────────────────────

export const ContentTypePaymentConfirmation: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'payment-confirmation',
  versionMajor: 1,
  versionMinor: 0,
};

export interface PaymentConfirmation {
  kind: 'payment-confirmation';
  appId: string;
  requestId: string;
  txHash?: string;
  messageId?: string;
}

export function isPaymentConfirmationContent(t: ContentTypeId | undefined): boolean {
  return !!t && eq(t, ContentTypePaymentConfirmation);
}

export const paymentConfirmationCodec: ContentCodec<PaymentConfirmation> =
  jsonCodec<PaymentConfirmation>(ContentTypePaymentConfirmation);

// ── Bill Split ───────────────────────────────────────────────────────────────

export const ContentTypeBillSplit: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'bill-split',
  versionMajor: 1,
  versionMinor: 0,
};

export interface BillSplit {
  kind: 'bill-split';
  appId: string;
  billId: string;
  description: string;
  totalAmount: string;
  symbol: string;
  creator: string;
  shares: { address: string; amount: string }[]; // what each non-creator member owes
  createdAt: number;
}

export function isBillSplitContent(t: ContentTypeId | undefined): boolean {
  return !!t && eq(t, ContentTypeBillSplit);
}

export const billSplitCodec: ContentCodec<BillSplit> =
  jsonCodec<BillSplit>(ContentTypeBillSplit);

export const ContentTypeBillSplitPayment: ContentTypeId = {
  authorityId: AUTHORITY,
  typeId: 'bill-split-payment',
  versionMajor: 1,
  versionMinor: 0,
};

export interface BillSplitPayment {
  kind: 'bill-split-payment';
  appId: string;
  billId: string;
  payerAddress: string;
  txHash?: string;
}

export function isBillSplitPaymentContent(t: ContentTypeId | undefined): boolean {
  return !!t && eq(t, ContentTypeBillSplitPayment);
}

export const billSplitPaymentCodec: ContentCodec<BillSplitPayment> =
  jsonCodec<BillSplitPayment>(ContentTypeBillSplitPayment);

export const ALL_CODECS = [
  paymentRequestCodec,
  paymentConfirmationCodec,
  billSplitCodec,
  billSplitPaymentCodec,
];

export function isValidPaymentRequest(
  payload: PaymentRequest,
  senderAddress: string,
): boolean {
  if (payload.kind !== 'payment-request') return false;
  if (payload.appId !== APP_ID) return false;
  if (payload.requester.toLowerCase() !== senderAddress.toLowerCase()) return false;
  if (!payload.amount || isNaN(Number(payload.amount)) || Number(payload.amount) <= 0)
    return false;
  if (!payload.symbol) return false;
  if (payload.mode !== 'request' && payload.mode !== 'split') return false;
  return true;
}
