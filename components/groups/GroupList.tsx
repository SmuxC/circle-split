'use client';

import { IconUsersGroup } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@/hooks/use-wallet';
import { cn, shortenAddress } from '@/lib/utils';

type GroupRow = {
  group: string;
  type?: string;
  owner: string;
  name?: string;
  symbol?: string;
  memberCount?: number;
};

type Enriched = GroupRow & {
  previewImageUrl?: string;
  imageUrl?: string;
  displayName?: string;
};

export function GroupList() {
  const { address, isConnected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<Enriched[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { Sdk } = await import('@aboutcircles/sdk');
        const sdk = new Sdk();

        // 1. Memberships → list of group addresses for this wallet.
        const memberships = await sdk.rpc.group.getGroupMemberships(
          address as `0x${string}`,
          50,
        );
        if (cancelled) return;
        const groupAddrs = memberships.results.map((m) => m.group);
        if (groupAddrs.length === 0) {
          setGroups([]);
          setLoading(false);
          return;
        }

        // 2. Enrich with group metadata (name, symbol, owner, memberCount).
        const found = await sdk.rpc.group.findGroups(50, { groupAddressIn: groupAddrs });
        if (cancelled) return;

        // 3. Pull IPFS profile per group for image + display name.
        const profiles = await sdk.rpc.profile.getProfileByAddressBatch(
          found.results.map((g) => g.group),
        );
        if (cancelled) return;

        const rows: Enriched[] = found.results.map((g, i) => {
          const p = profiles[i] as
            | { name?: string; previewImageUrl?: string; imageUrl?: string }
            | null;
          return {
            ...(g as GroupRow),
            displayName: p?.name,
            previewImageUrl: p?.previewImageUrl,
            imageUrl: p?.imageUrl,
          };
        });
        setGroups(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <IconUsersGroup className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Connect via the Circles host to see your groups.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="px-4 py-3 text-sm text-destructive">Failed to load: {error}</Card>
    );
  }

  if (groups.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <IconUsersGroup className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">No groups yet.</p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {groups.map((g) => {
        const img = g.previewImageUrl ?? g.imageUrl;
        const isOwner = address && g.owner.toLowerCase() === address.toLowerCase();
        return (
          <li key={g.group}>
            <Card className="flex items-center gap-3 px-3 py-2">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <IconUsersGroup className="size-5" />
                </span>
              )}
              <div className="flex flex-1 flex-col leading-tight">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {g.displayName ?? g.name ?? 'Unnamed group'}
                  </span>
                  {g.symbol && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
                      {g.symbol}
                    </span>
                  )}
                  {isOwner && (
                    <span
                      className={cn(
                        'rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary',
                      )}
                    >
                      Owner
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {shortenAddress(g.group)}
                </span>
              </div>
              {typeof g.memberCount === 'number' && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                </span>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
