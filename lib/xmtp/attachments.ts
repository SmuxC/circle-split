import {
  AttachmentCodec,
  RemoteAttachmentCodec,
  type Attachment,
  type RemoteAttachment,
} from '@xmtp/content-type-remote-attachment';
import type { Client } from '@xmtp/browser-sdk';
import type { ContentTypeId } from '@xmtp/content-type-primitives';

import type { SerialisedRemoteAttachment } from './codecs';

// RemoteAttachmentCodec.load expects a registry with `codecFor(type)`.
// Browser SDK Client exposes `getCodec(type)` — different method name, so
// passing the client directly throws "codecRegistry.codecFor is not a
// function". RemoteAttachments in our pipeline always wrap an Attachment,
// so a single-codec shim is enough.
const SHIM_REGISTRY = {
  codecFor: (type: ContentTypeId) => {
    const codec = new AttachmentCodec();
    if (
      type.authorityId === codec.contentType.authorityId &&
      type.typeId === codec.contentType.typeId
    ) {
      return codec;
    }
    return undefined;
  },
};

const UPLOAD_ENDPOINT = '/api/blob-upload';
const FETCH_ENDPOINT = '/api/blob-fetch';

// Server route caps body at 4 MiB. Encryption adds ~28 bytes (GCM tag)
// plus base64 overhead is irrelevant here (we send raw bytes). Leave a
// healthy margin so the request never bounces with 413.
const TARGET_BYTES = Math.floor(3.8 * 1024 * 1024);

// Compression search space — applied in order, first hit under TARGET_BYTES
// wins. Pairs of (scale, quality). Quality stops at 0.6 because below that
// photos visibly degrade; tighter scaling is preferred.
const COMPRESSION_STEPS: { scale: number; quality: number }[] = [
  { scale: 1, quality: 0.85 },
  { scale: 0.85, quality: 0.8 },
  { scale: 0.7, quality: 0.75 },
  { scale: 0.5, quality: 0.7 },
  { scale: 0.4, quality: 0.65 },
  { scale: 0.3, quality: 0.6 },
];

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
 * Internal: compress (if needed) → encrypt with RemoteAttachmentCodec →
 * upload ciphertext → return the raw RemoteAttachment plus mimeType.
 */
async function uploadAndBuild(file: File): Promise<{
  remote: RemoteAttachment;
  mimeType: string;
}> {
  const prepared = await shrinkIfNeeded(file, TARGET_BYTES);
  const data = new Uint8Array(await prepared.arrayBuffer());
  const mimeType = prepared.type || 'application/octet-stream';
  const attachment: Attachment = {
    filename: prepared.name,
    mimeType,
    data,
  };

  const encrypted = await RemoteAttachmentCodec.encodeEncrypted(
    attachment,
    new AttachmentCodec(),
  );

  // Direct POST to our own endpoint. The endpoint uses server-side `put()`
  // which avoids the client-token + cross-origin PUT dance that was
  // silently hanging behind 10 retries inside the Circles iframe.
  const pathname = `xmtp-attachments/${crypto.randomUUID()}-${safeName(prepared.name)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let res: Response;
  try {
    res = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-pathname': pathname,
      },
      body: encrypted.payload as BodyInit,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Upload timed out after 60s.');
    }
    throw new Error(
      `Upload network error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Upload failed: HTTP ${res.status}`);
  }
  const { pathname: storedPath } = (await res.json()) as {
    url: string;
    pathname: string;
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const proxyUrl = `${origin}${FETCH_ENDPOINT}?path=${encodeURIComponent(storedPath)}`;

  const remote: RemoteAttachment = {
    url: proxyUrl,
    contentDigest: encrypted.digest,
    salt: encrypted.salt,
    nonce: encrypted.nonce,
    secret: encrypted.secret,
    scheme: 'https://',
    contentLength: encrypted.payload.byteLength,
    filename: prepared.name,
  };
  return { remote, mimeType };
}

/**
 * For chat DMs — sends the RemoteAttachment directly via the official
 * codec, no JSON wrapping. Caller does `dm.send(remoteAttachmentCodec.encode(remote))`.
 */
export async function encryptAndUploadFileRaw(
  file: File,
): Promise<{ remote: RemoteAttachment; mimeType: string }> {
  return uploadAndBuild(file);
}

export function serialiseRemoteAttachment(
  ra: RemoteAttachment,
  mimeType: string,
): SerialisedRemoteAttachment {
  return {
    url: ra.url,
    contentDigest: ra.contentDigest,
    salt: bytesToBase64(ra.salt),
    nonce: bytesToBase64(ra.nonce),
    secret: bytesToBase64(ra.secret),
    scheme: ra.scheme,
    contentLength: ra.contentLength,
    filename: ra.filename,
    mimeType,
  };
}

/**
 * For payment requests — returns JSON-safe metadata embedded inside the
 * PaymentRequest payload.
 */
export async function encryptAndUploadFile(
  file: File,
): Promise<SerialisedRemoteAttachment> {
  const { remote, mimeType } = await uploadAndBuild(file);
  return serialiseRemoteAttachment(remote, mimeType);
}

/**
 * Reverses the upload: rebuilds the RemoteAttachment shape from the wire
 * payload, lets the codec download + decrypt, and returns an object URL
 * usable by <img src>. Caller is responsible for revoking the URL.
 */
export async function loadRemoteAttachment(
  _client: Client,
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
  return decryptRemote(remote, meta.mimeType);
}

/**
 * For chat-side RemoteAttachments that arrive directly via the codec
 * (no SerialisedRemoteAttachment wrapper).
 */
export async function loadRemoteAttachmentRaw(
  remote: RemoteAttachment,
  fallbackMime = 'application/octet-stream',
): Promise<{ url: string; mimeType: string; filename: string }> {
  return decryptRemote(remote, fallbackMime);
}

async function decryptRemote(
  remote: RemoteAttachment,
  fallbackMime: string,
): Promise<{ url: string; mimeType: string; filename: string }> {
  const decoded = (await RemoteAttachmentCodec.load(
    remote,
    SHIM_REGISTRY as unknown as Parameters<typeof RemoteAttachmentCodec.load>[1],
  )) as Attachment;
  const mimeType = decoded.mimeType || fallbackMime;
  const blob = new Blob([decoded.data as BlobPart], { type: mimeType });
  return {
    url: URL.createObjectURL(blob),
    mimeType,
    filename: decoded.filename || remote.filename,
  };
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

/**
 * If `file` exceeds `maxBytes`, re-encode as WebP at decreasing scale +
 * quality until it fits. Non-image files that exceed the limit throw —
 * we can't generically compress arbitrary bytes.
 */
async function shrinkIfNeeded(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file;
  if (!file.type.startsWith('image/')) {
    throw new Error(
      `${file.name} is ${formatMB(file.size)} (over ${formatMB(maxBytes)}) and isn't an image, so it can't be compressed.`,
    );
  }
  if (typeof document === 'undefined') {
    throw new Error('Image compression requires a browser environment.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    for (const { scale, quality } of COMPRESSION_STEPS) {
      const blob = await reencodeWebp(img, scale, quality);
      if (blob && blob.size <= maxBytes) {
        return new File([blob], `${baseName}.webp`, {
          type: 'image/webp',
          lastModified: Date.now(),
        });
      }
    }
    throw new Error(
      `Could not compress ${file.name} under ${formatMB(maxBytes)}. Try a smaller image.`,
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image for compression.'));
    img.src = src;
  });
}

async function reencodeWebp(
  img: HTMLImageElement,
  scale: number,
  quality: number,
): Promise<Blob | null> {
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  );
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
