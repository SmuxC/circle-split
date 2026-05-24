import {
  AttachmentCodec,
  RemoteAttachmentCodec,
  type Attachment,
  type RemoteAttachment,
} from '@xmtp/content-type-remote-attachment';
import type { Client } from '@xmtp/browser-sdk';

import type { SerialisedRemoteAttachment } from './codecs';

const UPLOAD_ENDPOINT = '/api/blob-upload';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Encrypts a single File using XMTP's RemoteAttachmentCodec, uploads the
 * ciphertext to Vercel Blob, and returns the JSON-safe metadata needed by
 * the recipient to fetch + decrypt.
 *
 * The ciphertext is opaque bytes; only holders of the secret embedded in
 * the (separately E2E-encrypted) XMTP message can decrypt it.
 */
export async function encryptAndUploadFile(
  file: File,
): Promise<SerialisedRemoteAttachment> {
  const data = new Uint8Array(await file.arrayBuffer());
  const attachment: Attachment = {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    data,
  };

  const encrypted = await RemoteAttachmentCodec.encodeEncrypted(
    attachment,
    new AttachmentCodec(),
  );

  // Dynamic import — `@vercel/blob/client` references browser-only globals
  // (fetch, FormData) and must not land in a server bundle.
  const { upload } = await import('@vercel/blob/client');
  const pathname = `xmtp-attachments/${crypto.randomUUID()}-${safeName(file.name)}`;
  // Wrap in a Blob so the SDK's PutBody type accepts the payload (it doesn't
  // accept raw Uint8Array even though the underlying fetch would).
  const ciphertext = new Blob([encrypted.payload as BlobPart], {
    type: 'application/octet-stream',
  });
  const blob = await upload(pathname, ciphertext, {
    access: 'public',
    handleUploadUrl: UPLOAD_ENDPOINT,
    contentType: 'application/octet-stream',
  });

  return {
    url: blob.url,
    contentDigest: encrypted.digest,
    salt: bytesToBase64(encrypted.salt),
    nonce: bytesToBase64(encrypted.nonce),
    secret: bytesToBase64(encrypted.secret),
    scheme: 'https://',
    contentLength: encrypted.payload.byteLength,
    filename: file.name,
    mimeType: attachment.mimeType,
  };
}

/**
 * Reverses the upload: rebuilds the RemoteAttachment shape from the wire
 * payload, lets the codec download + decrypt, and returns an object URL
 * usable by <img src>. Caller is responsible for revoking the URL.
 */
export async function loadRemoteAttachment(
  client: Client,
  meta: SerialisedRemoteAttachment,
): Promise<{ url: string; mimeType: string; filename: string }> {
  const remote: RemoteAttachment = {
    url: meta.url,
    contentDigest: meta.contentDigest,
    salt: base64ToBytes(meta.salt),
    nonce: base64ToBytes(meta.nonce),
    secret: base64ToBytes(meta.secret),
    scheme: meta.scheme,
    contentLength: meta.contentLength,
    filename: meta.filename,
  };
  const decoded = (await RemoteAttachmentCodec.load(
    remote,
    client as unknown as Parameters<typeof RemoteAttachmentCodec.load>[1],
  )) as Attachment;
  const blob = new Blob([decoded.data as BlobPart], {
    type: decoded.mimeType || meta.mimeType,
  });
  return {
    url: URL.createObjectURL(blob),
    mimeType: decoded.mimeType || meta.mimeType,
    filename: decoded.filename || meta.filename,
  };
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}
