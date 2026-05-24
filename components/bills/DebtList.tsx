'use client';

import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCircleCheck,
  IconCoins,
  IconLoader2,
  IconPlugConnected,
  IconReceiptOff,
} from '@tabler/icons-react';
import type { Dm } from '@xmtp/browser-sdk';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { useWallet } from '@/hooks/use-wallet';
import { cn, shortenAddress } from '@/lib/utils';
import { computeDebts, sendBillSplitPayment, type DebtEntry } from '@/lib/xmtp/bills';
import { callCrcTransfer } from '@/lib/xmtp/crcTransfer';
import { fetchDmMessages } from '@/lib/xmtp/dms';

type DebtWithConv = DebtEntry & { conversationId: string; convName: string };

// ── DebtList ──────────────────────────────────────────────────────────────────

export function DebtList({
  limit,
  title,
  showPayAll = true,
}: {
  limit?: number;
  title?: string;
  showPayAll?: boolean;
}) {
  const { client, status, error: xmtpError, connect } = useXmtp();
  const { address, isConnected } = useWallet();

  const [debts, setDebts] = useState<DebtWithConv[]>([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [sessionPaid, setSessionPaid] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!client || !address) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await client.conversations.sync();
        const [dms, groups] = await Promise.all([
          client.conversations.listDms({ consentStates: [0, 1] as never }),
          (client.conversations as unknown as {
            listGroups: (opts: unknown) => Promise<unknown[]>;
          }).listGroups({ consentStates: [0, 1] as never }),
        ]);

        const allConvs = [
          ...(dms as unknown[]),
          ...(groups as unknown[]),
        ] as Array<{ id: string; name?: string; isDm: boolean; sync: () => Promise<void> }>;

        const chunks = await Promise.all(
          allConvs.map(async (conv) => {
            try {
              await conv.sync();
              const { peer, messages } = await fetchDmMessages(conv as unknown as Dm, client);
              const convDebts = computeDebts(messages, address);
              if (convDebts.length === 0) return [];
              const convName = conv.isDm ? shortenAddress(peer) : (conv.name ?? 'Group');
              return convDebts.map((d) => ({ ...d, conversationId: conv.id, convName }));
            } catch {
              return [];
            }
          }),
        );

        if (!cancelled) {
          const flat = chunks.flat().sort((a, b) => {
            if (a.paid !== b.paid) return a.paid ? 1 : -1;
            if (a.direction !== b.direction) return a.direction === 'i-owe' ? -1 : 1;
            return 0;
          });
          setDebts(limit ? flat.slice(0, limit) : flat);
        }
      } catch {
        if (!cancelled) setDebts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client, address, limit]);

  const debtKey = (d: DebtEntry) => `${d.billId}:${d.counterparty}`;

  const visibleDebts = useMemo(
    () => debts.map((d) => ({ ...d, paid: d.paid || sessionPaid.has(debtKey(d)) })),
    [debts, sessionPaid],
  );

  const unpaidIOwe = visibleDebts.filter((d) => d.direction === 'i-owe' && !d.paid);

  const payDebt = async (debt: DebtWithConv) => {
    if (!client || !address) return;
    const key = debtKey(debt);
    setPayingId(key);
    setPayError(null);
    try {
      const conv = await client.conversations.getConversationById(debt.conversationId);
      if (!conv) throw new Error('Conversation not found');
      const { hash } = await callCrcTransfer({
        source: address,
        sink: debt.counterparty,
        amountCRC: debt.amount.toString(),
        note: `Bill: ${debt.description}`,
        peerDisplay: shortenAddress(debt.counterparty),
        conversation: conv as unknown as Parameters<typeof callCrcTransfer>[0]['conversation'],
      });
      await sendBillSplitPayment(conv as unknown as { send: (c: unknown) => Promise<unknown> }, {
        billId: debt.billId,
        payerAddress: address,
        txHash: hash,
      });
      setSessionPaid((prev) => new Set([...prev, key]));
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e));
    } finally {
      setPayingId(null);
    }
  };

  const handlePayAll = async () => {
    if (!client || !address || unpaidIOwe.length === 0) return;
    setPaying(true);
    setPayError(null);
    try {
      for (const debt of unpaidIOwe) {
        await payDebt(debt);
      }
    } finally {
      setPaying(false);
    }
  };

  // ── Not connected ──────────────────────────────────────────────────────────

  if (!isConnected) return null;

  if (status !== 'ready') {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-8 text-center">
        <IconPlugConnected className="size-7 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Connect to XMTP to load bill split debts.</p>
        {status === 'error' && xmtpError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {xmtpError}
          </p>
        )}
        <Button type="button" onClick={connect} disabled={status === 'connecting'}>
          {status === 'connecting' && <IconLoader2 className="size-4 animate-spin" />}
          {status === 'connecting' ? 'Signing…' : 'Connect XMTP'}
        </Button>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {title && (
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h3>
        )}
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (visibleDebts.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {title && (
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h3>
        )}
        <Card className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <IconReceiptOff className="size-7 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No bill split debts yet.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {(title || (showPayAll && unpaidIOwe.length > 0)) && (
        <div className="flex items-center justify-between">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </h3>
          )}
          {showPayAll && unpaidIOwe.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={handlePayAll}
              disabled={paying}
              className="h-7 px-3 text-xs"
            >
              {paying ? (
                <><IconLoader2 className="size-3 animate-spin" /> Paying…</>
              ) : (
                `Pay all (${unpaidIOwe.length})`
              )}
            </Button>
          )}
        </div>
      )}

      {payError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {payError}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {visibleDebts.map((d) => {
          const key = debtKey(d);
          const isPayingThis = payingId === key;
          return (
            <li key={key}>
              <DebtRow
                debt={d}
                onPay={d.direction === 'i-owe' && !d.paid ? () => payDebt(d) : undefined}
                paying={isPayingThis}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Debt row ──────────────────────────────────────────────────────────────────

function DebtRow({
  debt,
  onPay,
  paying,
}: {
  debt: DebtWithConv;
  onPay?: () => void;
  paying?: boolean;
}) {
  const iOwe = debt.direction === 'i-owe';
  const Icon = iOwe ? IconArrowUpRight : IconArrowDownLeft;
  const color = iOwe ? 'text-rose-600' : 'text-emerald-600';
  const bgColor = iOwe ? 'bg-rose-500/10' : 'bg-emerald-500/10';

  return (
    <Card className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('grid size-7 place-items-center rounded-full', bgColor)}>
            <Icon className={cn('size-4', color)} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{debt.description}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {debt.convName} · {iOwe ? `→ ${shortenAddress(debt.counterparty)}` : `← ${shortenAddress(debt.counterparty)}`}
            </span>
          </div>
        </div>
        <span className={cn('font-mono text-base font-semibold', color)}>
          {iOwe ? '-' : '+'}{debt.amount.toFixed(2)} {debt.symbol}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {iOwe ? 'You owe' : 'Owed to you'}
        </span>
        {debt.paid ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <IconCircleCheck className="size-3" />
            Settled
            {debt.txHash && (
              <TxLinkInline hash={debt.txHash} />
            )}
          </span>
        ) : onPay ? (
          <Button
            type="button"
            size="sm"
            onClick={onPay}
            disabled={paying}
            className="ml-auto h-6 px-2 text-[10px]"
          >
            {paying ? <IconLoader2 className="size-3 animate-spin" /> : (
              <><IconCoins className="size-3" /> Pay {debt.amount.toFixed(2)} {debt.symbol}</>
            )}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function TxLinkInline({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <a
      href={`https://gnosisscan.io/tx/${hash}`}
      onClick={(e) => {
        e.preventDefault();
        const url = `https://gnosisscan.io/tx/${hash}`;
        const w = window.open(url, '_blank', 'noopener,noreferrer');
        if (!w) {
          navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        }
      }}
      rel="noopener noreferrer"
      className="underline-offset-2 hover:underline"
    >
      {copied ? 'Copied!' : '↗'}
    </a>
  );
}
