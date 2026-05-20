'use client';

import { IconLoader2, IconLuggage, IconPlugConnected } from '@tabler/icons-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@/hooks/use-wallet';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { cn, shortenAddress } from '@/lib/utils';
import { listTrips, type TripSummary } from '@/lib/xmtp/trips';

import { CreateTripSheet } from './CreateTripSheet';

export function TripList() {
  const { isConnected } = useWallet();
  const { client, status, error, tick, connect } = useXmtp();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const t = await listTrips(client);
        if (!cancelled) setTrips(t);
      } catch {
        if (!cancelled) setTrips([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, refreshKey, tick]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <IconLuggage className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect via the Circles host to start a trip.
        </p>
      </Card>
    );
  }

  if (status !== 'ready') {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <IconPlugConnected className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect to XMTP to load encrypted trip chats.
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <CreateTripSheet onCreated={refresh} />
      </div>
      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <IconLuggage className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No trips yet.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {trips.map((t) => (
            <li key={t.conversationId}>
              <Link href={`/groups/${t.conversationId}`}>
                <Card
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/40',
                  )}
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <IconLuggage className="size-5" />
                  </span>
                  <div className="flex flex-1 flex-col leading-tight">
                    <span className="text-sm font-semibold">{t.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.members.length} members · {t.currency} · created by{' '}
                      <span className="font-mono">{shortenAddress(t.creator)}</span>
                    </span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
