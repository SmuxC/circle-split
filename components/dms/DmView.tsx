'use client';

import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCamera,
  IconGif,
  IconLoader2,
  IconPhoto,
  IconSend,
  IconX,
} from '@tabler/icons-react';
import type { Dm } from '@xmtp/browser-sdk';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { GifDrawer } from '@/components/wallet/GifDrawer';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { useWallet } from '@/hooks/use-wallet';
import { cn, shortenAddress } from '@/lib/utils';
import {
  fetchDmMessages,
  getDm,
  sendDmGif,
  sendDmPhoto,
  sendDmText,
  type DmMessage,
} from '@/lib/xmtp/dms';

export function DmView({ conversationId }: { conversationId: string }) {
  const { client, status, tick } = useXmtp();
  const { address } = useWallet();
  const [dm, setDm] = useState<Dm | null>(null);
  const [peer, setPeer] = useState<string>('');
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await getDm(client, conversationId);
        if (!d) {
          if (!cancelled) setError('DM not found in your XMTP inbox.');
          return;
        }
        const { peer: p, messages: m } = await fetchDmMessages(d, client);
        if (cancelled) return;
        setDm(d);
        setPeer(p);
        setMessages(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, conversationId, tick]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSendText = async () => {
    if (!dm || !text.trim()) return;
    setSending(true);
    try {
      await sendDmText(dm, text);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const handlePickGif = async (gif: { src: string }) => {
    if (!dm) return;
    setSending(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await sendDmGif(dm, origin + gif.src);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!dm || !files || files.length === 0) return;
    setSending(true);
    try {
      // Send each photo as its own RemoteAttachment message.
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        await sendDmPhoto(dm, file);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  if (status !== 'ready') {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Connect to XMTP first.</p>
      </Card>
    );
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col gap-3">
      <Card className="flex items-center gap-3 px-3 py-2">
        <div className="flex flex-col leading-tight">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            DM
          </span>
          <span className="font-mono text-sm font-semibold" title={peer}>
            {peer ? shortenAddress(peer) : '…'}
          </span>
        </div>
      </Card>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/30 p-3"
      >
        {loading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-2/3 rounded-md" />
            ))}
          </div>
        )}
        {!loading && error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="m-auto text-sm text-muted-foreground">
            No messages yet. Say hi.
          </p>
        )}
        {!loading &&
          messages.map((m) => <MessageBubble key={m.id} message={m} myAddress={address ?? ''} />)}
      </div>

      <Card className="flex items-center gap-2 px-2 py-2">
        <GifDrawer
          onSelect={handlePickGif}
          trigger={
            <button
              type="button"
              aria-label="Send GIF"
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
            >
              <IconGif className="size-5" />
            </button>
          }
        />
        <button
          type="button"
          aria-label="Send photo"
          onClick={() => galleryInputRef.current?.click()}
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
        >
          <IconPhoto className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Take photo"
          onClick={() => cameraInputRef.current?.click()}
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
        >
          <IconCamera className="size-5" />
        </button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendText();
            }
          }}
          placeholder="Message"
          disabled={sending}
          className="h-9 flex-1 border-0 bg-transparent focus-visible:ring-0"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleSendText}
          disabled={sending || !text.trim()}
          className="h-9"
        >
          {sending ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />}
        </Button>
      </Card>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function MessageBubble({
  message,
  myAddress,
}: {
  message: DmMessage;
  myAddress: string;
}) {
  const mine = message.mine;
  const align = mine ? 'self-end' : 'self-start';
  const bubble = cn(
    'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
    mine
      ? 'rounded-br-sm bg-foreground text-background'
      : 'rounded-bl-sm bg-card text-foreground border',
  );

  switch (message.kind) {
    case 'text':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <p className={bubble}>{message.text}</p>
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    case 'gif':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <div className="relative size-40 overflow-hidden rounded-2xl border bg-muted">
            <Image
              src={message.url}
              alt=""
              fill
              sizes="160px"
              className="object-cover"
              unoptimized
            />
          </div>
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    case 'payment-request':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <PaymentRequestCard message={message} myAddress={myAddress} />
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    case 'attachment':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <InlineAttachment
            data={message.data}
            mimeType={message.mimeType}
            filename={message.filename}
          />
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    case 'remote-attachment':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <RemoteAttachmentBubble message={message} />
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    default:
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <p className={cn(bubble, 'italic text-muted-foreground')}>
            {message.fallback || 'Unsupported message'}
          </p>
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );
  }
}

function Timestamp({ ts, mine }: { ts: number; mine: boolean }) {
  return (
    <span
      className={cn(
        'px-1 text-[10px] text-muted-foreground',
        mine ? 'self-end' : 'self-start',
      )}
    >
      {new Date(ts * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}
    </span>
  );
}

function PaymentRequestCard({
  message,
  myAddress,
}: {
  message: Extract<DmMessage, { kind: 'payment-request' }>;
  myAddress: string;
}) {
  const p = message.payload;
  const me = myAddress.toLowerCase();
  const incoming = p.requester.toLowerCase() !== me;
  const Icon = incoming ? IconArrowUpRight : IconArrowDownLeft;
  const color = incoming
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-emerald-600 dark:text-emerald-400';

  return (
    <Card className="flex w-72 flex-col gap-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-7 place-items-center rounded-full',
            incoming ? 'bg-rose-500/10' : 'bg-emerald-500/10',
          )}
        >
          <Icon className={cn('size-4', color)} />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {p.mode === 'split' ? 'Split request' : 'Payment request'}
          </span>
          <span className={cn('font-mono text-base font-semibold', color)}>
            {p.amount} {p.symbol}
          </span>
        </div>
      </div>
      {p.message && <p className="text-xs text-muted-foreground">{p.message}</p>}
      {p.attachments?.[0] && (
        <div className="relative size-20 overflow-hidden rounded-md border bg-muted">
          <Image
            src={p.attachments[0]}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      {p.remoteAttachments?.[0] && (
        <RemoteThumb meta={p.remoteAttachments[0]} />
      )}
    </Card>
  );
}

function InlineAttachment({
  data,
  mimeType,
  filename,
}: {
  data: Uint8Array;
  mimeType: string;
  filename: string;
}) {
  // Build the object URL synchronously from props (no effect required) and
  // revoke on unmount via a final-value ref. Skips the cascading-render
  // setState-in-effect pattern.
  const [url] = useState(() =>
    URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType })),
  );
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (mimeType.startsWith('image/')) {
    return (
      <div className="relative size-40 overflow-hidden rounded-2xl border bg-muted">
        <Image src={url} alt={filename} fill sizes="160px" className="object-cover" unoptimized />
      </div>
    );
  }
  return (
    <a
      href={url}
      download={filename}
      className="rounded-2xl border bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
    >
      📎 {filename}
    </a>
  );
}

function RemoteAttachmentBubble({
  message,
}: {
  message: Extract<DmMessage, { kind: 'remote-attachment' }>;
}) {
  const { client } = useXmtp();
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ready'; url: string; mimeType: string } | { kind: 'error' }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const { loadRemoteAttachmentRaw } = await import('@/lib/xmtp/attachments');
        const { url, mimeType } = await loadRemoteAttachmentRaw(message.remote);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setState({ kind: 'ready', url, mimeType });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [client, message.remote]);

  if (state.kind === 'loading') {
    return (
      <div className="grid size-40 place-items-center rounded-2xl border bg-muted">
        <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="grid size-40 place-items-center rounded-2xl border bg-muted text-xs text-destructive">
        <span className="flex flex-col items-center gap-1">
          <IconX className="size-4" />
          Failed to load
        </span>
      </div>
    );
  }
  if (state.mimeType.startsWith('image/')) {
    return (
      <div className="relative size-40 overflow-hidden rounded-2xl border bg-muted">
        <Image
          src={state.url}
          alt={message.remote.filename}
          fill
          sizes="160px"
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }
  return (
    <a
      href={state.url}
      download={message.remote.filename}
      className="rounded-2xl border bg-card px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
    >
      📎 {message.remote.filename}
    </a>
  );
}

function RemoteThumb({
  meta,
}: {
  meta: NonNullable<
    Extract<DmMessage, { kind: 'payment-request' }>['payload']['remoteAttachments']
  >[number];
}) {
  const { client } = useXmtp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const { loadRemoteAttachment } = await import('@/lib/xmtp/attachments');
        const decoded = await loadRemoteAttachment(client, meta);
        if (cancelled) {
          URL.revokeObjectURL(decoded.url);
          return;
        }
        createdUrl = decoded.url;
        setUrl(decoded.url);
      } catch {
        // Silent — preview card just won't show the photo.
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [client, meta]);

  if (!url) return null;
  return (
    <div className="relative size-20 overflow-hidden rounded-md border bg-muted">
      <Image src={url} alt={meta.filename} fill sizes="80px" className="object-cover" unoptimized />
    </div>
  );
}
