'use client';

import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCircleCheck,
  IconCoins,
  IconGif,
  IconLoader2,
  IconReceiptOff,
  IconSend,
  IconUsersGroup,
  IconX,
} from '@tabler/icons-react';
import type { Dm } from '@xmtp/browser-sdk';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { GifDrawer } from '@/components/wallet/GifDrawer';
import { useChatContext } from '@/components/layout/ChatContext';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { useWallet } from '@/hooks/use-wallet';
import { cn, shortenAddress } from '@/lib/utils';
import { circlesGetTransferData, getCirclesMaxFlow } from '@/lib/circles/rpc';
import { computeDebts, sendBillSplitPayment, type DebtEntry } from '@/lib/xmtp/bills';
import { encodeMessageId, callCrcTransfer, type CrcTransferPayload } from '@/lib/xmtp/crcTransfer';
import {
  fetchDmMessages,
  getDm,
  sendDmGif,
  sendDmText,
  type DmMessage,
} from '@/lib/xmtp/dms';
import { sendPaymentConfirmation } from '@/lib/xmtp/requests';
import type { BillSplit, BillSplitPayment } from '@/lib/xmtp/codecs';

export function DmView({ conversationId }: { conversationId: string }) {
  const { client, status, tick, storageWarning } = useXmtp();
  const { address } = useWallet();
  const { setChat } = useChatContext();
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

  // Non-null when paying a bill split debt.
  const [debtPay, setDebtPay] = useState<DebtEntry | null>(null);

  // Compute debts from all messages (only relevant for groups).
  const debts = useMemo(
    () => (groupName && address ? computeDebts(messages, address) : []),
    [messages, groupName, address],
  );

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

  useEffect(() => {
    if (loading || (!peer && !groupName)) return;
    const name = groupName ?? shortenAddress(peer);
    setChat({ name, backUrl: '/groups' });
    return () => setChat(null);
  }, [peer, groupName, loading, setChat]);

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

  const handleDebtPay = async (debt: DebtEntry, amountCRC: string, note: string) => {
    if (!dm || !address) return;
    setSending(true);
    try {
      const { hash, messageId } = await callCrcTransfer({
        source: address,
        sink: debt.counterparty,
        amountCRC,
        note,
        peerDisplay: shortenAddress(debt.counterparty),
        conversation: dm as unknown as Parameters<typeof callCrcTransfer>[0]['conversation'],
      });
      setCrcTxHashes((prev) => new Map(prev).set(messageId, hash));
      await sendBillSplitPayment(dm as unknown as { send: (c: unknown) => Promise<unknown> }, {
        billId: debt.billId,
        payerAddress: address,
        txHash: hash,
      });
      setDebtPay(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const [payingAllDebts, setPayingAllDebts] = useState(false);

  const handlePayAllDebts = async () => {
    if (!dm || !address) return;
    const unpaid = debts.filter((d) => d.direction === 'i-owe' && !d.paid);
    if (unpaid.length === 0) return;
    setPayingAllDebts(true);
    setError(null);
    try {
      for (const debt of unpaid) {
        const { hash, messageId } = await callCrcTransfer({
          source: address,
          sink: debt.counterparty,
          amountCRC: debt.amount.toString(),
          note: `Bill: ${debt.description}`,
          peerDisplay: shortenAddress(debt.counterparty),
          conversation: dm as unknown as Parameters<typeof callCrcTransfer>[0]['conversation'],
        });
        setCrcTxHashes((prev) => new Map(prev).set(messageId, hash));
        await sendBillSplitPayment(dm as unknown as { send: (c: unknown) => Promise<unknown> }, {
          billId: debt.billId,
          payerAddress: address,
          txHash: hash,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPayingAllDebts(false);
    }
  };

  if (status !== 'ready') {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Connect to XMTP first.</p>
      </Card>
    );
  }

  const anySheetOpen = crcOpen || !!payReq || !!debtPay;

  return (
    <div className="flex h-full flex-col">
      {storageWarning && (
        <p className="shrink-0 rounded-none bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700">
          {storageWarning}
        </p>
      )}

      {groupName && debts.length > 0 && (
        <div className="shrink-0 px-3 pt-3">
          <DebtOverview
            debts={debts}
            onPay={setDebtPay}
            onPayAll={handlePayAllDebts}
            payingAll={payingAllDebts}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-3',
          anySheetOpen ? 'pb-[24rem] md:pb-3' : 'pb-40 md:pb-3',
        )}
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

      {/* Input island — fixed above bottom nav on mobile, static at bottom on desktop */}
      <div className="fixed inset-x-0 bottom-24 z-50 flex flex-col gap-2 px-3 pb-2 md:static md:bottom-auto md:inset-auto md:px-3 md:pb-3">
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
        {debtPay && (
          <CrcTransferSheet
            myAddress={address ?? ''}
            peerAddress={debtPay.counterparty}
            onSend={(amt, note) => handleDebtPay(debtPay, amt, note)}
            onClose={() => setDebtPay(null)}
            sending={sending}
            initialAmount={debtPay.amount.toString()}
            initialNote={`Bill: ${debtPay.description}`}
            title={`Pay ${shortenAddress(debtPay.counterparty)}`}
          />
        )}
        <Card className="flex-row items-center gap-2 px-2 py-2 shadow-lg">
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
    'w-fit max-w-[80%] rounded-2xl px-3 py-2 text-sm',
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

    case 'bill-split':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <BillSplitBubble payload={message.payload} mine={mine} />
          <Timestamp ts={message.ts} mine={mine} />
        </div>
      );

    case 'bill-split-payment':
      return (
        <div className={cn('flex flex-col gap-0.5', align)}>
          <BillSplitPaymentBubble payload={message.payload} mine={mine} />
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

function BillSplitBubble({ payload, mine }: { payload: BillSplit; mine: boolean }) {
  return (
    <Card className="flex w-72 flex-col gap-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-violet-500/10">
          <IconUsersGroup className="size-4 text-violet-600" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mine ? 'You split' : 'Bill split'}
          </span>
          <span className="font-mono text-base font-semibold text-violet-600">
            {payload.totalAmount} {payload.symbol}
          </span>
        </div>
      </div>
      <p className="text-xs font-medium">{payload.description}</p>
      <div className="flex flex-col gap-0.5 border-t pt-2">
        {payload.shares.map((s) => (
          <div key={s.address} className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {shortenAddress(s.address)}
            </span>
            <span className="font-mono text-xs font-semibold">
              {s.amount} {payload.symbol}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BillSplitPaymentBubble({ payload, mine }: { payload: BillSplitPayment; mine: boolean }) {
  return (
    <Card className="flex w-64 flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-emerald-500/10">
          <IconCircleCheck className="size-3.5 text-emerald-600" />
        </span>
        <span className="text-xs font-semibold text-emerald-600">
          {mine ? 'You paid your share' : `${shortenAddress(payload.payerAddress)} paid`}
        </span>
      </div>
      {payload.txHash && <TxLink hash={payload.txHash} />}
    </Card>
  );
}

// ── Debt Overview ─────────────────────────────────────────────────────────────

function DebtOverview({
  debts,
  onPay,
  onPayAll,
  payingAll = false,
}: {
  debts: DebtEntry[];
  onPay: (d: DebtEntry) => void;
  onPayAll?: () => void;
  payingAll?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const iOwe = debts.filter((d) => d.direction === 'i-owe' && !d.paid);
  const owedToMe = debts.filter((d) => d.direction === 'owed-to-me' && !d.paid);
  const settled = debts.filter((d) => d.paid);
  const pendingCount = iOwe.length + owedToMe.length;

  return (
    <Card className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex flex-1 items-center gap-2"
        >
          <IconUsersGroup className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Debts</span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">
              {pendingCount} pending
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
        </button>
        {onPayAll && iOwe.length > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={onPayAll}
            disabled={payingAll}
            className="ml-2 h-7 shrink-0 px-2 text-[10px]"
          >
            {payingAll ? (
              <IconLoader2 className="size-3 animate-spin" />
            ) : (
              `Pay all (${iOwe.length})`
            )}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t pt-2">
          {iOwe.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                You owe
              </span>
              {iOwe.map((d) => (
                <div key={`${d.billId}:${d.counterparty}`} className="flex items-center gap-2">
                  <div className="flex flex-1 flex-col leading-tight">
                    <span className="text-xs font-medium">{d.description}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      → {shortenAddress(d.counterparty)}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-rose-600">
                    {d.amount.toFixed(2)} {d.symbol}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onPay(d)}
                    className="h-7 px-2 text-[10px]"
                  >
                    Pay
                  </Button>
                </div>
              ))}
            </div>
          )}

          {owedToMe.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                Owed to you
              </span>
              {owedToMe.map((d) => (
                <div key={`${d.billId}:${d.counterparty}`} className="flex items-center gap-2">
                  <div className="flex flex-1 flex-col leading-tight">
                    <span className="text-xs font-medium">{d.description}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ← {shortenAddress(d.counterparty)}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-emerald-600">
                    {d.amount.toFixed(2)} {d.symbol}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Pending</span>
                </div>
              ))}
            </div>
          )}

          {iOwe.length === 0 && owedToMe.length === 0 && settled.length === 0 && (
            <div className="flex flex-col items-center gap-1 py-2">
              <IconReceiptOff className="size-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">All settled up</span>
            </div>
          )}

          {settled.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Settled
              </span>
              {settled.map((d) => (
                <div key={`${d.billId}:${d.counterparty}:settled`} className="flex items-center gap-2">
                  <div className="flex flex-1 flex-col leading-tight">
                    <span className="text-xs text-muted-foreground line-through">{d.description}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {d.amount.toFixed(2)} {d.symbol}
                  </span>
                  <IconCircleCheck className="size-3.5 text-emerald-500" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
