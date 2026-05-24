import type { Client, Dm } from '@xmtp/browser-sdk';

import {
  APP_ID,
  ContentTypePaymentRequest,
  isPaymentConfirmationContent,
  isPaymentRequestContent,
  isValidPaymentRequest,
  paymentConfirmationCodec,
  paymentRequestCodec,
  type PaymentConfirmation,
  type PaymentRequest,
} from './codecs';

export type PaymentRequestRecord = {
  conversationId: string;
  requestId: string;
  requester: string;
  payer: string;
  amount: string;
  symbol: string;
  message?: string;
  mode: 'request' | 'split';
  ts: number;
  direction: 'incoming' | 'outgoing';
  paidTxHash?: string;
};

export async function sendPaymentRequest(
  client: Client,
  args: {
    recipient: string;
    requester: string;
    amount: string;
    symbol: string;
    message?: string;
    mode: 'request' | 'split';
  },
): Promise<{ conversationId: string; payload: PaymentRequest }> {
  const dm = await client.conversations.createDmWithIdentifier({
    identifier: args.recipient.toLowerCase(),
    identifierKind: 0 as never,
  });

  const payload: PaymentRequest = {
    kind: 'payment-request',
    appId: APP_ID,
    requestId: crypto.randomUUID(),
    requester: args.requester.toLowerCase(),
    payer: args.recipient.toLowerCase(),
    amount: args.amount,
    symbol: args.symbol,
    message: args.message,
    mode: args.mode,
    ts: Math.floor(Date.now() / 1000),
  };

  await dm.send(paymentRequestCodec.encode(payload));
  try {
    await dm.updateConsentState(1 as never);
  } catch {}

  return { conversationId: dm.id, payload };
}

export async function listPaymentRequests(
  client: Client,
  myAddress: string,
): Promise<PaymentRequestRecord[]> {
  await client.conversations.sync();
  const dms = (await client.conversations.listDms({
    consentStates: [0, 1] as never,
  })) as Dm[];

  const me = myAddress.toLowerCase();
  const out: PaymentRequestRecord[] = [];
  const seen = new Set<string>();

  for (const dm of dms) {
    try {
      await dm.sync();
      const msgs = await dm.messages({ limit: 200n });
      const peerMap = await dmSenderMap(dm);

      // Pass 1: collect confirmations keyed by requestId
      const confirmations = new Map<string, string | undefined>();
      for (const m of msgs) {
        if (!isPaymentConfirmationContent(m.contentType)) continue;
        const conf = m.content as PaymentConfirmation;
        if (conf?.requestId) confirmations.set(conf.requestId, conf.txHash);
      }

      // Pass 2: collect payment requests
      for (const m of msgs) {
        if (!isPaymentRequestContent(m.contentType)) continue;
        const payload = m.content as PaymentRequest;
        const sender = peerMap.get(m.senderInboxId);
        if (!sender) continue;
        if (!isValidPaymentRequest(payload, sender)) continue;
        if (seen.has(payload.requestId)) continue;
        seen.add(payload.requestId);

        const direction: 'incoming' | 'outgoing' =
          sender.toLowerCase() === me ? 'outgoing' : 'incoming';

        out.push({
          conversationId: dm.id,
          requestId: payload.requestId,
          requester: payload.requester.toLowerCase(),
          payer: payload.payer.toLowerCase(),
          amount: payload.amount,
          symbol: payload.symbol,
          message: payload.message,
          mode: payload.mode,
          ts: payload.ts,
          direction,
          paidTxHash: confirmations.get(payload.requestId),
        });
      }
    } catch {}
  }

  out.sort((a, b) => b.ts - a.ts);
  return out;
}

async function dmSenderMap(dm: Dm): Promise<Map<string, string>> {
  const members = await dm.members();
  const map = new Map<string, string>();
  for (const m of members) {
    const eth = m.accountIdentifiers.find((id) => id.identifierKind === 0);
    if (eth) map.set(m.inboxId, eth.identifier.toLowerCase());
  }
  return map;
}

export async function sendPaymentConfirmation(
  dm: Dm,
  args: { requestId: string; txHash?: string; messageId?: string },
): Promise<void> {
  const payload: PaymentConfirmation = {
    kind: 'payment-confirmation',
    appId: APP_ID,
    requestId: args.requestId,
    txHash: args.txHash,
    messageId: args.messageId,
  };
  await dm.send(paymentConfirmationCodec.encode(payload));
}

export { ContentTypePaymentRequest };
