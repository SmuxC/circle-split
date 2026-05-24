import type { Client, Dm, DecodedMessage } from '@xmtp/browser-sdk';
import {
  ContentTypeAttachment,
  ContentTypeRemoteAttachment,
  RemoteAttachmentCodec,
  type Attachment,
  type RemoteAttachment,
} from '@xmtp/content-type-remote-attachment';
import type { ContentTypeId } from '@xmtp/content-type-primitives';

import { encryptAndUploadFileRaw } from './attachments';
import {
  isPaymentRequestContent,
  isValidPaymentRequest,
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
};

type Base = {
  id: string;
  ts: number;
  sender: string;
  mine: boolean;
};

export type DmMessage =
  | (Base & { kind: 'text'; text: string })
  | (Base & { kind: 'gif'; url: string; text?: string })
  | (Base & { kind: 'payment-request'; payload: PaymentRequest })
  | (Base & {
      kind: 'attachment';
      filename: string;
      mimeType: string;
      data: Uint8Array;
    })
  | (Base & { kind: 'remote-attachment'; remote: RemoteAttachment })
  | (Base & { kind: 'unknown'; fallback?: string });

// Recognises gif/image URLs the user pasted/sent so the chat can render them
// inline rather than as a raw link.
const IMAGE_URL_RE = /^https?:\/\/\S+\.(?:gif|webp|png|jpe?g)(?:\?\S*)?$/i;

function eq(a: ContentTypeId, b: ContentTypeId): boolean {
  return a.authorityId === b.authorityId && a.typeId === b.typeId;
}

/**
 * Lists DMs for the current client, newest activity first. Includes both
 * Allowed and Unknown consent so first-time inbound messages still surface.
 */
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
      });
    } catch {
      // Skip unreadable DM rather than dropping the whole list.
    }
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

  const messages: DmMessage[] = [];
  for (const m of ordered) {
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
      messages.push({ ...base, kind: 'payment-request', payload });
      continue;
    }

    if (eq(m.contentType, ContentTypeRemoteAttachment)) {
      messages.push({
        ...base,
        kind: 'remote-attachment',
        remote: m.content as RemoteAttachment,
      });
      continue;
    }

    if (eq(m.contentType, ContentTypeAttachment)) {
      const a = m.content as Attachment;
      messages.push({
        ...base,
        kind: 'attachment',
        filename: a.filename,
        mimeType: a.mimeType,
        data: a.data,
      });
      continue;
    }

    if (typeof m.content === 'string') {
      const text = m.content;
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

export async function sendDmPhoto(dm: Dm, file: File): Promise<void> {
  const { remote } = await encryptAndUploadFileRaw(file);
  const encoded = new RemoteAttachmentCodec().encode(remote);
  await dm.send(encoded);
  await tryAllow(dm);
}

async function tryAllow(dm: Dm): Promise<void> {
  try {
    await dm.updateConsentState(CONSENT_ALLOWED as never);
  } catch {
    // Non-fatal — list filters tolerate Unknown.
  }
}

export async function getDm(client: Client, id: string): Promise<Dm | null> {
  const conv = await client.conversations.getConversationById(id);
  if (!conv) return null;
  // DM and Group share Conversation base; rely on caller route only ever
  // passing DM ids. Cast for the API surface.
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
  } else if (eq(m.contentType, ContentTypeRemoteAttachment)) {
    preview = '📎 Attachment';
  } else if (eq(m.contentType, ContentTypeAttachment)) {
    preview = '📎 Attachment';
  } else if (typeof m.content === 'string') {
    const text = m.content;
    preview = IMAGE_URL_RE.test(text.trim()) ? '🖼 GIF' : text;
  } else if (m.fallback) {
    preview = m.fallback;
  } else {
    preview = '…';
  }
  return { ts, preview: preview.slice(0, 80) };
}
