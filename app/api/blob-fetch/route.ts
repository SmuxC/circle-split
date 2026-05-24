import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';

// Read-proxy for private Vercel Blob ciphertext.
//
// Private stores don't expose blob URLs directly — only holders of
// BLOB_READ_WRITE_TOKEN can read. This route fetches the bytes server-side
// and streams them back so the XMTP RemoteAttachmentCodec on the recipient
// can decrypt locally.
//
// Privacy note: bytes returned here are AES-GCM ciphertext sealed with a
// per-attachment key that only lives inside the (E2E-encrypted) XMTP
// payload. Anyone can hit this proxy and download the ciphertext, but
// without the key it's gibberish — same threat model a public Vercel Blob
// store would have given us.
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get('path') ?? '';
  if (!pathname.startsWith('xmtp-attachments/')) {
    return NextResponse.json({ error: 'Disallowed pathname' }, { status: 400 });
  }

  try {
    const result = await get(pathname, { access: 'private', useCache: true });
    if (!result || result.statusCode === 304) {
      return new Response(null, { status: 404 });
    }
    return new Response(result.stream, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        // Ciphertext is immutable + content-addressed by the XMTP digest.
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
