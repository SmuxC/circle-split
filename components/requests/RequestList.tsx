'use client';

import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconLoader2,
  IconPlugConnected,
  IconReceipt,
  IconReceiptOff,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { useWallet } from '@/hooks/use-wallet';
import { cn, shortenAddress } from '@/lib/utils';
import {
  listPaymentRequests,
  type PaymentRequestRecord,
} from '@/lib/xmtp/requests';

type Direction = 'incoming' | 'outgoing' | 'both';

export function RequestList({
  direction = 'both',
  limit,
  emptyLabel = 'No payment requests yet.',
  title,
}: {
  direction?: Direction;
  limit?: number;
  emptyLabel?: string;
  title?: string;
}) {
  const { isConnected, address } = useWallet();
  const { client, status, error, tick, connect } = useXmtp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PaymentRequestRecord[]>([]);

  useEffect(() => {
    if (!client || !address) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const all = await listPaymentRequests(client, address);
        if (cancelled) return;
        const filtered =
          direction === 'both' ? all : all.filter((r) => r.direction === direction);
        setItems(typeof limit === 'number' ? filtered.slice(0, limit) : filtered);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, address, tick, direction, limit]);

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <IconReceipt className="size-7 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect via the Circles host to see payment requests.
        </p>
      </Card>
    );
  }

  if (status !== 'ready') {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-8 text-center">
        <IconPlugConnected className="size-7 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect to XMTP to load encrypted payment requests.
        </p>
        {status === 'error' && error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
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

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <IconReceiptOff className="size-7 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((r) => (
          <li key={r.requestId}>
            <RequestRow record={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestRow({ record: r }: { record: PaymentRequestRecord }) {
  const incoming = r.direction === 'incoming';
  const counterparty = incoming ? r.requester : r.payer;
  const Icon = incoming ? IconArrowUpRight : IconArrowDownLeft;
  const amountColor = incoming ? 'text-rose-600' : 'text-emerald-600';
  const sign = incoming ? '-' : '+';

  return (
    <Card className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'grid size-7 place-items-center rounded-full',
              incoming ? 'bg-rose-500/10' : 'bg-emerald-500/10',
            )}
          >
            <Icon className={cn('size-4', amountColor)} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">
              {incoming ? 'Requested from you' : 'You requested'}
            </span>
            <span className="font-mono text-xs text-muted-foreground" title={counterparty}>
              {shortenAddress(counterparty)} · {new Date(r.ts * 1000).toLocaleDateString()}
            </span>
          </div>
        </div>
        <span className={cn('font-mono text-base font-semibold', amountColor)}>
          {sign}{r.amount} {r.symbol}
        </span>
      </div>
      {r.message && (
        <p className="border-t border-border pt-2 text-xs text-muted-foreground">{r.message}</p>
      )}
      {r.mode === 'split' && (
        <span className="self-start rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Split
        </span>
      )}
    </Card>
  );
}
