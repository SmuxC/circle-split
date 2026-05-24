import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

// Server-side upload endpoint for XMTP RemoteAttachment ciphertext.
//
// Why server-side instead of @vercel/blob/client `upload()`:
//   - No client→edge token exchange + cross-origin PUT (was hanging
//     inside the Circles iframe; the client SDK silently retries x10 on
//     network errors which manifests as "stuck" with no surfaced error).
//   - No webhook callback to debug.
//   - One request, one response — easy to reason about.
//
// Tradeoff: file payload transits our function, so request body is
// capped at MAX_BYTES to stay under Vercel's default 4.5MB function
// body limit on the Hobby plan. Bump if on Pro and you need bigger.
export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const pathname = request.headers.get('x-pathname') ?? '';
  if (!pathname.startsWith('xmtp-attachments/')) {
    return NextResponse.json({ error: 'Disallowed pathname' }, { status: 400 });
  }

  const lenHeader = request.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Limit ${MAX_BYTES} bytes.` },
      { status: 413 },
    );
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return NextResponse.json({ error: 'Failed to read body' }, { status: 400 });
  }
  if (body.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Limit ${MAX_BYTES} bytes.` },
      { status: 413 },
    );
  }

  try {
    const blob = await put(pathname, body, {
      access: 'public',
      contentType: 'application/octet-stream',
      addRandomSuffix: false,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
