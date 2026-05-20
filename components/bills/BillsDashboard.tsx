'use client';

import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCoins,
  IconLoader2,
  IconPlugConnected,
  IconReceiptOff,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@/hooks/use-wallet';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { cn, shortenAddress } from '@/lib/utils';
import { computeTripDashboard } from '@/lib/xmtp/settlements';
import {
  CONSENT_ALLOWED,
  fetchTripMessages,
  listTrips,
  type TripSummary,
} from '@/lib/xmtp/trips';

type Edge = {
  conversationId: string;
  tripName: string;
  currency: string;
  counterparty: string;
  amount: number;
};

type Aggregate = {
  owes: Edge[]; // user owes counterparty
  receives: Edge[]; // counterparty owes user
};

export function BillsDashboard() {
  const { isConnected, address } = useWallet();
  const { client, status, error, tick, connect } = useXmtp();
  const [loading, setLoading] = useState(false);
  const [agg, setAgg] = useState<Aggregate>({ owes: [], receives: [] });

  useEffect(() => {
    if (!client || !address) return;
    let cancelled = false;
    const me = address.toLowerCase();

    (async () => {
      setLoading(true);
      try {
        const trips = await listTrips(client);
        const accepted = trips.filter((t) => t.consentState === CONSENT_ALLOWED);
        const owes: Edge[] = [];
        const receives: Edge[] = [];

        await Promise.all(
          accepted.map(async (t: TripSummary) => {
            try {
              const g = await client.conversations.getConversationById(
                t.conversationId,
              );
              if (!g) return;
              const msgs = await fetchTripMessages(g as never, t.tripId);
              const d = computeTripDashboard(msgs, t.members);
              for (const s of d.settlements) {
                if (s.from === me) {
                  owes.push({
                    conversationId: t.conversationId,
                    tripName: t.name,
                    currency: t.currency,
                    counterparty: s.to,
                    amount: s.amount,
                  });
                } else if (s.to === me) {
                  receives.push({
                    conversationId: t.conversationId,
                    tripName: t.name,
                    currency: t.currency,
                    counterparty: s.from,
                    amount: s.amount,
                  });
                }
              }
            } catch {
              // Skip unreadable trip; surfacing per-trip failures here would
              // drown the dashboard for one corrupt group.
            }
          }),
        );

        if (!cancelled) setAgg({ owes, receives });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, address, tick]);

  const totals = useMemo(() => {
    const sumByCcy = (edges: Edge[]) => {
      const m = new Map<string, number>();
      for (const e of edges) m.set(e.currency, (m.get(e.currency) ?? 0) + e.amount);
      return m;
    };
    return { owes: sumByCcy(agg.owes), receives: sumByCcy(agg.receives) };
  }, [agg]);

  const hasAny = agg.owes.length > 0 || agg.receives.length > 0;

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <IconCoins className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect via the Circles host to see your bills.
        </p>
      </Card>
    );
  }

  if (status !== 'ready') {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <IconPlugConnected className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect to XMTP to aggregate expenses across your trips.
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
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Net totals */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <IconArrowUpRight className="size-4 text-rose-500" />
            You owe
          </div>
          {totals.owes.size === 0 ? (
            <p className="font-mono text-2xl font-semibold text-muted-foreground">0.00</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {[...totals.owes.entries()].map(([ccy, amt]) => (
                <p key={ccy} className="font-mono text-2xl font-semibold text-rose-600 dark:text-rose-400">
                  {amt.toFixed(2)} <span className="text-sm font-normal">{ccy}</span>
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <IconArrowDownLeft className="size-4 text-emerald-500" />
            Owed to you
          </div>
          {totals.receives.size === 0 ? (
            <p className="font-mono text-2xl font-semibold text-muted-foreground">0.00</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {[...totals.receives.entries()].map(([ccy, amt]) => (
                <p key={ccy} className="font-mono text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {amt.toFixed(2)} <span className="text-sm font-normal">{ccy}</span>
                </p>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Settle-all CTA */}
      <Card className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Settle everything you owe</p>
          <p className="text-xs text-muted-foreground">
            Pay all outstanding debts across every trip in one go (coming soon).
          </p>
        </div>
        <Button
          type="button"
          disabled={agg.owes.length === 0}
          title="Not implemented yet"
        >
          <IconCoins className="size-4" />
          Clear all debt
        </Button>
      </Card>

      {!hasAny && (
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <IconReceiptOff className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No open balances. All settled across your trips.
          </p>
        </Card>
      )}

      {/* Debts owed by user */}
      {agg.owes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            You owe
          </h3>
          <EdgeList edges={agg.owes} variant="owe" />
        </section>
      )}

      {/* Debts owed to user */}
      {agg.receives.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Owed to you
          </h3>
          <EdgeList edges={agg.receives} variant="receive" />
        </section>
      )}
    </div>
  );
}

function EdgeList({ edges, variant }: { edges: Edge[]; variant: 'owe' | 'receive' }) {
  // Group by counterparty + currency for a compact view; expand per trip below.
  const groups = useMemo(() => {
    const map = new Map<string, Edge[]>();
    for (const e of edges) {
      const key = `${e.counterparty}|${e.currency}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      counterparty: items[0].counterparty,
      currency: items[0].currency,
      total: items.reduce((s, e) => s + e.amount, 0),
      items,
    }));
  }, [edges]);

  return (
    <ul className="flex flex-col gap-2">
      {groups.map((g) => (
        <li key={g.key}>
          <Card className="flex flex-col gap-2 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm" title={g.counterparty}>
                {shortenAddress(g.counterparty)}
              </span>
              <span
                className={cn(
                  'font-mono text-base font-semibold',
                  variant === 'owe'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400',
                )}
              >
                {variant === 'owe' ? '-' : '+'}
                {g.total.toFixed(2)} {g.currency}
              </span>
            </div>
            <ul className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
              {g.items.map((e, i) => (
                <li
                  key={`${e.conversationId}-${i}`}
                  className="flex items-center justify-between gap-2"
                >
                  <Link
                    href={`/groups/${e.conversationId}`}
                    className="truncate text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {e.tripName}
                  </Link>
                  <span className="font-mono text-muted-foreground">
                    {e.amount.toFixed(2)} {e.currency}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </li>
      ))}
    </ul>
  );
}
