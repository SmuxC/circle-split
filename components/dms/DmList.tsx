'use client';

import { IconMessage, IconPlugConnected } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import { useWallet } from '@/hooks/use-wallet';
import { shortenAddress } from '@/lib/utils';
import { CONSENT_ALLOWED, listDms, type DmSummary } from '@/lib/xmtp/dms';

export function DmList() {
  const { isConnected } = useWallet();
  const { client, status, tick } = useXmtp();
  const [items, setItems] = useState<DmSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dms = await listDms(client);
        if (!cancelled) setItems(dms);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, tick]);

  if (!isConnected || status !== 'ready') {
    // Auth gating lives at the page level (TripList handles it). Show only
    // a quiet placeholder here so the section header still renders.
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-6 text-center">
        <IconPlugConnected className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">
          Connect to XMTP to see your DMs.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-6 text-center">
        <IconMessage className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">No DMs yet.</p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((dm) => (
        <li key={dm.conversationId}>
          <Link
            href={`/dms/${dm.conversationId}`}
            className="block transition-opacity hover:opacity-80"
          >
            <Card className="flex items-center gap-3 px-3 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <IconMessage className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate font-mono text-sm font-semibold">
                  {shortenAddress(dm.peer)}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {dm.lastPreview || 'No messages yet'}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                {dm.lastTs > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(dm.lastTs * 1000).toLocaleDateString()}
                  </span>
                )}
                {dm.consentState !== CONSENT_ALLOWED && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    New
                  </span>
                )}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
