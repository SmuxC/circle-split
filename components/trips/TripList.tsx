'use client';

import {
  IconCheck,
  IconLoader2,
  IconLuggage,
  IconPlugConnected,
  IconX,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@/hooks/use-wallet';
import { useXmtp } from '@/components/xmtp/XmtpProvider';
import {
  loadMemberProfiles,
  loadTrustContext,
  trustKind,
  type MemberProfile,
  type TrustContext,
} from '@/lib/circles/trust';
import { cn, shortenAddress } from '@/lib/utils';
import {
  CONSENT_ALLOWED,
  CONSENT_DENIED,
  CONSENT_UNKNOWN,
  listTrips,
  setTripConsent,
  type TripSummary,
} from '@/lib/xmtp/trips';

import { CreateTripSheet } from './CreateTripSheet';
import { MemberBadge } from './MemberBadge';

export function TripList() {
  const { isConnected, address } = useWallet();
  const { client, status, error, tick, connect } = useXmtp();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trustCtx, setTrustCtx] = useState<TrustContext | null>(null);
  const [profiles, setProfiles] = useState<Map<string, MemberProfile>>(new Map());

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

  // Load my trust graph once per connected wallet; cheap O(1) lookups after.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    loadTrustContext(address)
      .then((ctx) => {
        if (!cancelled) setTrustCtx(ctx);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Enrich pending-invite members with names + pictures from Circles indexer.
  useEffect(() => {
    const addrs = new Set<string>();
    for (const t of trips) {
      if (t.consentState !== CONSENT_UNKNOWN) continue;
      for (const m of t.members) addrs.add(m.toLowerCase());
    }
    // Drop already-loaded.
    const need = [...addrs].filter((a) => !profiles.has(a));
    if (need.length === 0) return;
    let cancelled = false;
    loadMemberProfiles(need)
      .then((m) => {
        if (cancelled) return;
        setProfiles((prev) => {
          const next = new Map(prev);
          for (const [k, v] of m) next.set(k, v);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trips, profiles]);

  const { accepted, pending } = useMemo(() => {
    const a: TripSummary[] = [];
    const p: TripSummary[] = [];
    for (const t of trips) {
      if (t.consentState === CONSENT_ALLOWED) a.push(t);
      else if (t.consentState === CONSENT_UNKNOWN) p.push(t);
    }
    return { accepted: a, pending: p };
  }, [trips]);

  const handleConsent = useCallback(
    async (conversationId: string, state: number) => {
      if (!client) return;
      setBusyId(conversationId);
      try {
        await setTripConsent(client, conversationId, state);
        refresh();
      } finally {
        setBusyId(null);
      }
    },
    [client, refresh],
  );

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {accepted.length} active · {pending.length} pending
        </h2>
        <CreateTripSheet onCreated={refresh} />
      </div>

      {/* Pending invites — require manual approval. */}
      {pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Invites pending review
          </h3>
          <ul className="flex flex-col gap-2">
            {pending.map((t) => {
              const inviterKind = trustCtx ? trustKind(trustCtx, t.creator) : 'none';
              const inviterProfile = profiles.get(t.creator.toLowerCase());
              // Trust signal at the group level: how many of the members do
              // I already have mutual/one-way trust with? Helps spot mixed
              // groups (e.g. one trusted, one not).
              const trustedCount =
                trustCtx
                  ? t.members.filter((m) => trustKind(trustCtx, m) !== 'none').length
                  : 0;
              return (
                <li key={t.conversationId}>
                  <Card className="flex flex-col gap-3 border-amber-300 px-3 py-3 dark:border-amber-700">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        <IconLuggage className="size-5" />
                      </span>
                      <div className="flex flex-1 flex-col leading-tight">
                        <span className="text-sm font-semibold">{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          Invited by{' '}
                          <span className="font-mono">
                            {inviterProfile?.name ?? shortenAddress(t.creator)}
                          </span>{' '}
                          · {t.members.length} members · {t.currency} · {trustedCount}/
                          {t.members.length} trusted
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {t.members.map((m) => (
                        <MemberBadge
                          key={m}
                          address={m}
                          profile={profiles.get(m.toLowerCase())}
                          kind={trustCtx ? trustKind(trustCtx, m) : 'none'}
                          highlight={m.toLowerCase() === t.creator.toLowerCase()}
                        />
                      ))}
                    </div>
                    <p
                      className={cn(
                        'text-xs',
                        inviterKind === 'none'
                          ? 'text-amber-800 dark:text-amber-300'
                          : 'text-muted-foreground',
                      )}
                    >
                      {inviterKind === 'mutual'
                        ? 'Mutual trust with the inviter. Likely safe.'
                        : inviterKind === 'none'
                          ? '⚠ No Circles trust relation with the inviter. Verify identity off-band before accepting.'
                          : 'One-way Circles trust with the inviter. Verify before accepting.'}
                    </p>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleConsent(t.conversationId, CONSENT_DENIED)}
                      disabled={busyId === t.conversationId}
                    >
                      <IconX className="size-4" />
                      Decline
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleConsent(t.conversationId, CONSENT_ALLOWED)}
                      disabled={busyId === t.conversationId}
                    >
                      {busyId === t.conversationId ? (
                        <IconLoader2 className="size-4 animate-spin" />
                      ) : (
                        <IconCheck className="size-4" />
                      )}
                      Accept
                    </Button>
                  </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Trusted / accepted trips. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Trips
        </h3>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : accepted.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <IconLuggage className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">No accepted trips yet.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {accepted.map((t) => (
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
      </section>
    </div>
  );
}
