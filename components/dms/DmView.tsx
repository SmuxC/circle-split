'use client';

import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCircleCheck,
  IconCoins,
  IconGif,
  IconLoader2,
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
import { circlesGetTransferData, getCirclesMaxFlow } from '@/lib/circles/rpc';
import { encodeMessageId, callCrcTransfer, type CrcTransferPayload } from '@/lib/xmtp/crcTransfer';
import {
  fetchDmMessages,
  getDm,
  sendDmGif,
  sendDmText,
  type DmMessage,
} from '@/lib/xmtp/dms';
import { sendPaymentConfirmation } from '@/lib/xmtp/requests';

export function DmView({ conversationId }: { conversationId: string }) {
  const { client, status, tick, storageWarning } = useXmtp();
  const { address } = useWallet();
  const [dm, setDm] = useState<Dm | null>(null);
  const [peer, setPeer] = useState<string>('');
  const [groupName, setGroupName] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [crcOpen, setCrcOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Map of messageId → txHash for CRC transfers sent this session.
  const [crcTxHashes, setCrcTxHashes] = useState<Map<string, string>>(new Map());

  // Non-null when paying an incoming payment request.
  const [payReq, setPayReq] = useState<{
    requestId: string;
    amount: string;
    note?: string;
  } | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await getDm(client, conversationId);
        if (!d) {
          if (!cancelled) setError('Conversation not found in your XMTP inbox.');
          return;
        }
        const { peer: p, messages: m } = await fetchDmMessages(d, client);
        if (cancelled) return;
        // Detect group conversation by name property (groups always have one; DMs don't).
        const rawName = (d as unknown as { name?: string }).name;
        setGroupName(rawName ?? null);
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

  const handleCrcSend = async (amountCRC: string, note: string) => {
    if (!dm || !address || !peer) return;
    setSending(true);
    try {
      const { hash, messageId } = await callCrcTransfer({
        source: address,
        sink: peer,
        amountCRC,
        note,
        peerDisplay: shortenAddress(peer),
        conversation: dm as unknown as Parameters<typeof callCrcTransfer>[0]['conversation'],
      });
      setCrcTxHashes((prev) => new Map(prev).set(messageId, hash));
      setCrcOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const handlePayRequest = (msg: Extract<DmMessage, { kind: 'payment-request' }>) => {
    setPayReq({ requestId: msg.payload.requestId, amount: msg.payload.amount, note: msg.payload.message });
    setCrcOpen(false);
  };

  const handlePayReqSend = async (amountCRC: string, note: string) => {
    if (!dm || !address || !peer || !payReq) return;
    setSending(true);
    try {
      const { hash, messageId } = await callCrcTransfer({
        source: address,
        sink: peer,
        amountCRC,
        note,
        peerDisplay: shortenAddress(peer),
        conversation: dm as unknown as Parameters<typeof callCrcTransfer>[0]['conversation'],
      });
      setCrcTxHashes((prev) => new Map(prev).set(messageId, hash));
      await sendPaymentConfirmation(dm as import('@xmtp/browser-sdk').Dm, {
        requestId: payReq.requestId,
        txHash: hash,
        messageId,
      });
      setPayReq(null);
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
            {groupName ? 'Group' : 'DM'}
          </span>
          <span className="text-sm font-semibold" title={groupName ?? peer}>
            {groupName ?? (peer ? shortenAddress(peer) : '…')}
          </span>
        </div>
      </Card>

      {storageWarning && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700">
          {storageWarning}
        </p>
      )}

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/30 p-3"
      >
        {loading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-2/3 rounded-md" />
            ))}
          </div>
        )}
        {!loading && error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="m-auto text-sm text-muted-foreground">No messages yet. Say hi.</p>
        )}
        {!loading &&
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              myAddress={address ?? ''}
              overrideTxHash={m.kind === 'crc-transfer' ? crcTxHashes.get(m.messageId) : undefined}
              connectedAddress={address ?? ''}
              onPayRequest={handlePayRequest}
            />
          ))}
      </div>

      {crcOpen && (
        <CrcTransferSheet
          myAddress={address ?? ''}
          peerAddress={peer}
          onSend={handleCrcSend}
          onClose={() => setCrcOpen(false)}
          sending={sending}
        />
      )}
      {payReq && (
        <CrcTransferSheet
          myAddress={address ?? ''}
          peerAddress={peer}
          onSend={handlePayReqSend}
          onClose={() => setPayReq(null)}
          sending={sending}
          initialAmount={payReq.amount}
          initialNote={payReq.note}
          title="Pay Request"
        />
      )}

      <Card className="flex-row items-center gap-2 px-2 py-2">
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
        {!groupName && (
          <button
            type="button"
            aria-label="Send CRC"
            onClick={() => { setCrcOpen((o) => !o); setPayReq(null); }}
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-md transition-colors',
              crcOpen
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <IconCoins className="size-5" />
          </button>
        )}
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
          {sending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconSend className="size-4" />
          )}
        </Button>
      </Card>
    </div>
  );
}

// ── CRC Transfer Sheet ────────────────────────────────────────────────────────

function CrcTransferSheet({
  myAddress,
  peerAddress,
  onSend,
  onClose,
  sending,
  initialAmount,
  initialNote,
  title = 'Send CRC',
}: {
  myAddress: string;
  peerAddress: string;
  onSend: (amount: string, note: string) => Promise<void>;
  onClose: () => void;
  sending: boolean;
  initialAmount?: string;
  initialNote?: string;
  title?: string;
}) {
  const [amount, setAmount] = useState(initialAmount ?? '');
  const [note, setNote] = useState(initialNote ?? '');
  const [maxFlow, setMaxFlow] = useState<string | null>(null);
  const [loadingMax, setLoadingMax] = useState(false);

  useEffect(() => {
    if (!myAddress || !peerAddress) return;
    let cancelled = false;
    (async () => {
      setLoadingMax(true);
      try {
        const flow = await getCirclesMaxFlow(myAddress, peerAddress);
        if (!cancelled) setMaxFlow(flow);
      } catch {
        if (!cancelled) setMaxFlow(null);
      } finally {
        if (!cancelled) setLoadingMax(false);
      }
    })();
    return () => { cancelled = true; };
  }, [myAddress, peerAddress]);

  const amountNum = Number(amount);
  const maxNum = maxFlow ? Number(maxFlow) : undefined;
  const overMax = maxNum !== undefined && amountNum > maxNum;
  const canSend = amount && amountNum > 0 && !overMax && !sending;

  return (
    <Card className="flex flex-col gap-3 overflow-y-auto px-4 py-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <IconX className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="Amount (CRC)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 flex-1"
          />
          {maxFlow && (
            <button
              type="button"
              className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              onClick={() => setAmount(maxFlow)}
            >
              Max
            </button>
          )}
        </div>
        {loadingMax && (
          <p className="text-[10px] text-muted-foreground">Checking max flow…</p>
        )}
        {maxFlow && (
          <p className={cn('text-[10px]', overMax ? 'text-destructive' : 'text-muted-foreground')}>
            Max {maxFlow} CRC{overMax ? ' — exceeds available flow' : ''}
          </p>
        )}
      </div>
      <Input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="h-9"
      />
      <Button
        type="button"
        onClick={() => onSend(amount, note)}
        disabled={!canSend}
        className="self-end"
      >
        {sending ? <IconLoader2 className="size-4 animate-spin" /> : 'Send CRC'}
      </Button>
    </Card>
  );
}

// ── Message Bubbles ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  myAddress,
  overrideTxHash,
  connectedAddress,
  onPayRequest,
}: {
  message: DmMessage;
  myAddress: string;
  overrideTxHash?: string;
  connectedAddress: string;
  onPayRequest?: (msg: Extract<DmMessage, { kind: 'payment-request' }>) => void;
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
            <Image src={message.url} alt="" fill sizes="160px" className="object-cover" unoptimized />
          </div>
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    case 'crc-transfer':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <CrcTransferBubble
            payload={message.payload}
            messageId={message.messageId}
            mine={mine}
            overrideTxHash={overrideTxHash}
            connectedAddress={connectedAddress}
          />
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    case 'payment-request':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <PaymentRequestCard
            message={message}
            myAddress={myAddress}
            onPay={!message.mine && !message.paidTxHash && onPayRequest
              ? () => onPayRequest(message)
              : undefined}
          />
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    default:
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <p className={cn(bubble, 'italic text-muted-foreground')}>
            {(message as { fallback?: string }).fallback || 'Unsupported message'}
          </p>
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );
  }
}

function CrcTransferBubble({
  payload,
  messageId,
  mine,
  overrideTxHash,
  connectedAddress,
}: {
  payload: CrcTransferPayload;
  messageId: string;
  mine: boolean;
  overrideTxHash?: string;
  connectedAddress: string;
}) {
  const [txHash, setTxHash] = useState<string | null>(null);
  const resolvedHash = overrideTxHash ?? txHash;

  // Poll for tx hash on received messages (or after page reload for sent ones).
  useEffect(() => {
    if (resolvedHash) return;
    if (!connectedAddress) return;

    let encoded: string;
    try {
      encoded = encodeMessageId(messageId);
    } catch {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const MAX = 24;
    const INTERVAL = 5000;

    const poll = async () => {
      while (!cancelled && attempts < MAX) {
        attempts++;
        try {
          const transfers = await circlesGetTransferData(connectedAddress);
          const match = transfers.find((t) => t.data === encoded);
          if (match && !cancelled) {
            setTxHash(match.transactionHash);
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, INTERVAL));
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [messageId, connectedAddress, resolvedHash]);

  return (
    <Card className="flex w-64 flex-col gap-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-emerald-500/10">
          <IconCoins className="size-4 text-emerald-600" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mine ? 'Sent CRC' : 'Received CRC'}
          </span>
          <span className="font-mono text-base font-semibold text-emerald-600">
            {payload.value} CRC
          </span>
        </div>
      </div>
      {payload.note && <p className="text-xs text-muted-foreground">{payload.note}</p>}
      {resolvedHash ? (
        <TxLink hash={resolvedHash} />
      ) : (
        <span className="text-xs text-muted-foreground">Looking up transaction…</span>
      )}
    </Card>
  );
}

// Opens gnosisscan in a new tab; if the popup is blocked (sandboxed iframe)
// copies the URL to clipboard instead so the user can open it manually.
function TxLink({ hash, label = 'View transaction ↗', className }: {
  hash: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const url = `https://gnosisscan.io/tx/${hash}`;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <a
      href={`https://gnosisscan.io/tx/${hash}`}
      onClick={handleClick}
      rel="noopener noreferrer"
      className={className ?? 'text-xs text-primary underline-offset-2 hover:underline'}
    >
      {copied ? 'Link copied!' : label}
    </a>
  );
}

function Timestamp({ ts, mine }: { ts: number; mine: boolean }) {
  return (
    <span className={cn('px-1 text-[10px] text-muted-foreground', mine ? 'self-end' : 'self-start')}>
      {new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

function PaymentRequestCard({
  message,
  myAddress,
  onPay,
}: {
  message: Extract<DmMessage, { kind: 'payment-request' }>;
  myAddress: string;
  onPay?: () => void;
}) {
  const p = message.payload;
  const me = myAddress.toLowerCase();
  const incoming = p.requester.toLowerCase() !== me;
  const Icon = incoming ? IconArrowUpRight : IconArrowDownLeft;
  const color = incoming ? 'text-rose-600' : 'text-emerald-600';
  const paid = !!message.paidTxHash;

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
      {paid ? (
        <div className="flex items-center gap-1 text-xs text-emerald-600">
          <IconCircleCheck className="size-3" />
          <span>Paid</span>
          {message.paidTxHash && (
            <TxLink hash={message.paidTxHash} label="↗" className="underline-offset-2 hover:underline" />
          )}
        </div>
      ) : onPay ? (
        <Button type="button" size="sm" onClick={onPay} className="self-end text-xs">
          Pay {p.amount} {p.symbol}
        </Button>
      ) : null}
    </Card>
  );
}
