import type { Client, Dm, DecodedMessage } from '@xmtp/browser-sdk';

import { CRC_PREFIX, isCrcTransfer, parseCrcTransfer, type CrcTransferPayload } from './crcTransfer';
import {
  isBillSplitContent,
  isBillSplitPaymentContent,
  isPaymentConfirmationContent,
  isPaymentRequestContent,
  isValidPaymentRequest,
  type BillSplit,
  type BillSplitPayment,
  type PaymentConfirmation,
  type PaymentRequest,
} from './codecs';

export const CONSENT_UNKNOWN = 0;
export const CONSENT_ALLOWED = 1;
export const CONSENT_DENIED = 2;

export type DmSummary = {
  conversationId: string;
  peer: string;
  consentState: number;
  lastTs: number;
  lastPreview: string;
  isDm: boolean;
  name?: string;
};

type Base = {
  id: string;
  ts: number;
  sender: string;
  mine: boolean;
};

export type DmMessage =
  | (Base & { kind: 'text'; text: string })
  | (Base & { kind: 'gif'; url: string })
  | (Base & { kind: 'crc-transfer'; payload: CrcTransferPayload; messageId: string })
  | (Base & { kind: 'payment-request'; payload: PaymentRequest; paidTxHash?: string })
  | (Base & { kind: 'bill-split'; payload: BillSplit })
  | (Base & { kind: 'bill-split-payment'; payload: BillSplitPayment })
  | (Base & { kind: 'unknown'; fallback?: string });

const IMAGE_URL_RE = /^https?:\/\/\S+\.(?:gif|webp|png|jpe?g)(?:\?\S*)?$/i;

export async function listDms(client: Client): Promise<DmSummary[]> {
  await client.conversations.sync();
  const dms = (await client.conversations.listDms({
    consentStates: [CONSENT_UNKNOWN, CONSENT_ALLOWED] as never,
  })) as Dm[];

  const out: DmSummary[] = [];
  for (const dm of dms) {
    try {
      await dm.sync();
      const consentState = (await dm.consentState()) as unknown as number;
      const peer = await peerAddress(dm, client);
      if (!peer) continue;
      const last = await lastPreview(dm);
      out.push({
        conversationId: dm.id,
        peer,
        consentState,
        lastTs: last.ts,
        lastPreview: last.preview,
        isDm: true,
      });
    } catch {
      // Skip unreadable DM.
    }
  }
  out.sort((a, b) => b.lastTs - a.lastTs);
  return out;
}

export async function listAllConversations(client: Client): Promise<DmSummary[]> {
  await client.conversations.sync();

  const [dms, groups] = await Promise.all([
    client.conversations.listDms({
      consentStates: [CONSENT_UNKNOWN, CONSENT_ALLOWED] as never,
    }) as Promise<Dm[]>,
    (client.conversations as unknown as {
      listGroups: (opts: unknown) => Promise<unknown[]>;
    }).listGroups({
      consentStates: [CONSENT_UNKNOWN, CONSENT_ALLOWED] as never,
    }),
  ]);

  const out: DmSummary[] = [];
  const myInbox = await safeInboxId(client);

  for (const dm of dms as Dm[]) {
    try {
      await dm.sync();
      const consentState = (await dm.consentState()) as unknown as number;
      const peer = await peerAddress(dm, client);
      if (!peer) continue;
      const last = await lastPreview(dm);
      out.push({
        conversationId: dm.id,
        peer,
        consentState,
        lastTs: last.ts,
        lastPreview: last.preview,
        isDm: true,
      });
    } catch {}
  }

  for (const g of groups as Array<{
    id: string;
    name?: string;
    sync: () => Promise<void>;
    consentState: () => Promise<unknown>;
    members: () => Promise<{ inboxId: string }[]>;
    messages: (opts: { limit: bigint }) => Promise<DecodedMessage[]>;
  }>) {
    try {
      await g.sync();
      const consentState = (await g.consentState()) as unknown as number;
      const members = await g.members();
      const name = g.name ?? `Group (${members.length})`;
      const last = await groupLastPreview(g);
      // Use myInbox to determine peer (not used for display in groups, but needed for type)
      void myInbox;
      out.push({
        conversationId: g.id,
        peer: name,
        consentState,
        lastTs: last.ts,
        lastPreview: last.preview,
        isDm: false,
        name,
      });
    } catch {}
  }

  out.sort((a, b) => b.lastTs - a.lastTs);
  return out;
}

export async function fetchDmMessages(
  dm: Dm,
  client: Client,
): Promise<{ peer: string; messages: DmMessage[] }> {
  await dm.sync();
  const peer = (await peerAddress(dm, client)) ?? '0x';
  const raw = await dm.messages({ limit: 200n });
  const ordered = [...raw].sort((a, b) => Number(a.sentAtNs - b.sentAtNs));
  const senderMap = await senderAddressMap(dm);
  const myInbox = await safeInboxId(client);

  // Pass 1: collect payment confirmations keyed by requestId
  const confirmations = new Map<string, string | undefined>();
  for (const m of ordered) {
    if (!isPaymentConfirmationContent(m.contentType)) continue;
    const conf = m.content as PaymentConfirmation;
    if (conf?.requestId) confirmations.set(conf.requestId, conf.txHash);
  }

  const messages: DmMessage[] = [];
  for (const m of ordered) {
    // Skip confirmation messages — surfaced via paidTxHash on the request
    if (isPaymentConfirmationContent(m.contentType)) continue;

    const sender = senderMap.get(m.senderInboxId) ?? '0x';
    const ts = Number(m.sentAtNs / 1_000_000_000n);
    const id = m.id ?? `${m.senderInboxId}:${m.sentAtNs.toString()}`;
    const mine = m.senderInboxId === myInbox;
    const base = { id, ts, sender, mine };

    if (isPaymentRequestContent(m.contentType)) {
      const payload = m.content as PaymentRequest;
      if (!isValidPaymentRequest(payload, sender)) {
        messages.push({ ...base, kind: 'unknown', fallback: m.fallback });
        continue;
      }
      const paidTxHash = confirmations.get(payload.requestId);
      messages.push({ ...base, kind: 'payment-request', payload, paidTxHash });
      continue;
    }

    if (isBillSplitContent(m.contentType)) {
      const payload = m.content as BillSplit;
      messages.push({ ...base, kind: 'bill-split', payload });
      continue;
    }

    if (isBillSplitPaymentContent(m.contentType)) {
      const payload = m.content as BillSplitPayment;
      messages.push({ ...base, kind: 'bill-split-payment', payload });
      continue;
    }

    if (typeof m.content === 'string') {
      const text = m.content;
      if (isCrcTransfer(text)) {
        const payload = parseCrcTransfer(text);
        if (payload) {
          messages.push({ ...base, kind: 'crc-transfer', payload, messageId: m.id });
          continue;
        }
      }
      if (IMAGE_URL_RE.test(text.trim())) {
        messages.push({ ...base, kind: 'gif', url: text.trim() });
      } else {
        messages.push({ ...base, kind: 'text', text });
      }
      continue;
    }

    messages.push({ ...base, kind: 'unknown', fallback: m.fallback });
  }

  return { peer, messages };
}

export async function sendDmText(dm: Dm, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await dm.sendText(trimmed);
  await tryAllow(dm);
}

export async function sendDmGif(dm: Dm, url: string): Promise<void> {
  await dm.sendText(url);
  await tryAllow(dm);
}

async function tryAllow(dm: Dm): Promise<void> {
  try {
    await dm.updateConsentState(CONSENT_ALLOWED as never);
  } catch {}
}

export async function getDm(client: Client, id: string): Promise<Dm | null> {
  const conv = await client.conversations.getConversationById(id);
  if (!conv) return null;
  return conv as unknown as Dm;
}

async function peerAddress(dm: Dm, client: Client): Promise<string | null> {
  const myInbox = await safeInboxId(client);
  const members = await dm.members();
  for (const m of members) {
    if (m.inboxId === myInbox) continue;
    const eth = m.accountIdentifiers.find((id) => id.identifierKind === 0);
    if (eth) return eth.identifier.toLowerCase();
  }
  return null;
}

async function senderAddressMap(dm: Dm): Promise<Map<string, string>> {
  const members = await dm.members();
  const map = new Map<string, string>();
  for (const m of members) {
    const eth = m.accountIdentifiers.find((id) => id.identifierKind === 0);
    if (eth) map.set(m.inboxId, eth.identifier.toLowerCase());
  }
  return map;
}

async function safeInboxId(client: Client): Promise<string | undefined> {
  try {
    return (client as unknown as { inboxId: string }).inboxId;
  } catch {
    return undefined;
  }
}

async function lastPreview(dm: Dm): Promise<{ ts: number; preview: string }> {
  const msgs = await dm.messages({ limit: 5n });
  if (msgs.length === 0) return { ts: 0, preview: '' };
  const ordered = [...msgs].sort((a, b) => Number(b.sentAtNs - a.sentAtNs));
  const m = ordered[0] as DecodedMessage;
  const ts = Number(m.sentAtNs / 1_000_000_000n);
  let preview = '';
  if (isPaymentRequestContent(m.contentType)) {
    const p = m.content as PaymentRequest;
    preview = `${p.mode === 'split' ? 'Split' : 'Request'} ${p.amount} ${p.symbol}`;
  } else if (typeof m.content === 'string') {
    const text = m.content;
    if (isCrcTransfer(text)) {
      const p = parseCrcTransfer(text);
      preview = p ? `CRC ${p.value}` : 'CRC transfer';
    } else if (IMAGE_URL_RE.test(text.trim())) {
      preview = 'GIF';
    } else {
      preview = text;
    }
  } else if (isPaymentConfirmationContent(m.contentType)) {
    preview = 'Payment confirmed';
  } else if (isBillSplitContent(m.contentType)) {
    const p = m.content as BillSplit;
    preview = `Split: ${p.description} ${p.totalAmount} ${p.symbol}`;
  } else if (isBillSplitPaymentContent(m.contentType)) {
    preview = 'Paid their share';
  } else if (m.fallback) {
    preview = m.fallback;
  } else {
    preview = '…';
  }
  return { ts, preview: preview.slice(0, 80) };
}

async function groupLastPreview(g: {
  messages: (opts: { limit: bigint }) => Promise<DecodedMessage[]>;
}): Promise<{ ts: number; preview: string }> {
  const msgs = await g.messages({ limit: 5n });
  if (msgs.length === 0) return { ts: 0, preview: '' };
  const ordered = [...msgs].sort((a, b) => Number(b.sentAtNs - a.sentAtNs));
  const m = ordered[0];
  const ts = Number(m.sentAtNs / 1_000_000_000n);
  let preview: string;
  if (typeof m.content === 'string') {
    preview = m.content.slice(0, 80);
  } else if (isBillSplitContent(m.contentType)) {
    const p = m.content as BillSplit;
    preview = `Split: ${p.description}`;
  } else if (isBillSplitPaymentContent(m.contentType)) {
    preview = 'Paid their share';
  } else {
    preview = m.fallback ?? '…';
  }
  return { ts, preview };
}

// Export CRC_PREFIX for backward compat
export { CRC_PREFIX };
