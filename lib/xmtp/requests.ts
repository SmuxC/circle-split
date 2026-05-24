import type { Client, Dm } from '@xmtp/browser-sdk';

import {
  APP_ID,
  ContentTypePaymentRequest,
  isPaymentRequestContent,
  isValidPaymentRequest,
  paymentRequestCodec,
  type PaymentRequest,
} from './codecs';

export type PaymentRequestRecord = {
  conversationId: string;
  requestId: string;
  requester: string; // sender address (always lowercase)
  payer: string;
  amount: string;
  symbol: string;
  message?: string;
  attachments?: string[];
  mode: 'request' | 'split';
  ts: number; // seconds
  // 'incoming' = someone asked me; 'outgoing' = I asked someone.
  direction: 'incoming' | 'outgoing';
};

/**
 * Opens (or reuses) a 1:1 DM with the recipient and sends an encrypted
 * payment-request payload. Returns the DM id so callers can navigate.
 */
export async function sendPaymentRequest(
  client: Client,
  args: {
    recipient: string;
    requester: string;
    amount: string;
    symbol: string;
    message?: string;
    attachments?: string[];
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
    attachments: args.attachments?.length ? args.attachments : undefined,
    mode: args.mode,
    ts: Math.floor(Date.now() / 1000),
  };

  await dm.send(paymentRequestCodec.encode(payload));
  // Author-side auto-allow: surface own DMs in lists that exclude pending consent.
  try {
    await dm.updateConsentState(1 as never); // ConsentState.Allowed
  } catch {
    // Non-fatal — list filters tolerate Unknown state too.
  }

  return { conversationId: dm.id, payload };
}

/**
 * Scans all DMs for payment-request payloads. Returns both incoming
 * (someone asked me) and outgoing (I asked someone) records, deduplicated
 * by requestId, newest first.
 */
export async function listPaymentRequests(
  client: Client,
  myAddress: string,
): Promise<PaymentRequestRecord[]> {
  await client.conversations.sync();
  // ConsentState: 0=Unknown, 1=Allowed. Include both so unaccepted invites
  // (first-time inbound requests from strangers) still surface.
  const dms = (await client.conversations.listDms({
    consentStates: [0, 1] as never,
  })) as Dm[];

  const me = myAddress.toLowerCase();
  const out: PaymentRequestRecord[] = [];
  const seen = new Set<string>();

  for (const dm of dms) {
    try {
      await dm.sync();
      const msgs = await dm.messages({ limit: 100n });
      const peerMap = await dmSenderMap(dm);

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
          attachments: payload.attachments,
          mode: payload.mode,
          ts: payload.ts,
          direction,
        });
      }
    } catch {
      // Skip unreadable DM; don't drop the whole list.
    }
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

export { ContentTypePaymentRequest };
