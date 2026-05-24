import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

// Token issuer + completion webhook for client-side Vercel Blob uploads.
// The client (lib/xmtp/attachments.ts) calls `upload()` which POSTs here
// twice: first to get a short-lived write token, then again from Vercel's
// edge once the upload completes.
//
// Auth note: ciphertext is opaque, but the *URL* is public, so anything
// uploaded here is enumerable to anyone who can guess the path. The XMTP
// per-attachment secret is what keeps the bytes confidential. We still
// cap the content type + size below to avoid the endpoint being abused as
// a generic file host.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('xmtp-attachments/')) {
          throw new Error('Disallowed upload path.');
        }
        return {
          allowedContentTypes: ['application/octet-stream'],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async () => {
        // No server-side bookkeeping needed — XMTP message carries the URL.
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
