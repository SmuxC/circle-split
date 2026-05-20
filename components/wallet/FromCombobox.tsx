'use client';

import { IconUserFilled } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn, shortenAddress } from '@/lib/utils';

// Subset of SearchResultProfile from @aboutcircles/sdk-rpc; redeclared so we
// don't drag the package into the client bundle just for a type import.
type SearchResultProfile = {
  address: string;
  name: string;
  cid?: string;
  avatarType?: string;
  previewImageUrl?: string;
  imageUrl?: string;
  // Pulled from the IPFS profile JSON (returned by circles_getProfileByCid).
  // Only present when the profile actually stored one — older / non-Metri
  // profiles can have it as null.
  username?: string | null;
};

// SDK currently has no ENS resolution — it's Gnosis Chain / Circles-only. Add
// a separate Ethereum mainnet ENS resolver later if needed.
//
// circles_searchProfiles handles both names and full 0x… addresses on a single
// endpoint, so we don't need to branch on input shape here.

export function FromCombobox() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  // Tag results with the query that produced them so a stale fetch can't render
  // against a newer input value.
  const [data, setData] = useState<{ query: string; items: SearchResultProfile[] }>({
    query: '',
    items: [],
  });

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Debounced Circles profile search. Tries each input as both a name fragment
  // and a full address — the RPC endpoint handles both. Gated to ≥3 alphanumeric
  // characters to avoid hammering the indexer.
  useEffect(() => {
    const q = query.trim();
    const alnumCount = (q.match(/[A-Za-z0-9]/g) ?? []).length;
    if (alnumCount < 3) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const { Sdk } = await import('@aboutcircles/sdk');
        const sdk = new Sdk();
        const res = (await sdk.rpc.profile.searchProfiles(
          q,
          10,
          0,
        )) as unknown as SearchResultProfile[];
        if (cancelled) return;

        // searchProfiles only returns address/name/cid/avatarType. The full
        // IPFS profile (with image + username) is one batch RPC away.
        const cids = res.map((r) => r.cid).filter((c): c is string => !!c);
        type FullProfile = {
          previewImageUrl?: string;
          imageUrl?: string;
          username?: string | null;
        };
        let profiles: (FullProfile | null)[] = [];
        if (cids.length) {
          profiles = (await sdk.rpc.profile.getProfileByCidBatch(
            cids,
          )) as (FullProfile | null)[];
        }
        if (cancelled) return;

        const byCid = new Map<string, FullProfile | null>();
        let i = 0;
        for (const r of res) {
          if (r.cid) {
            byCid.set(r.cid, profiles[i] ?? null);
            i++;
          }
        }
        const enriched: SearchResultProfile[] = res.map((r) => {
          const p = r.cid ? byCid.get(r.cid) : null;
          return {
            ...r,
            previewImageUrl: p?.previewImageUrl || r.previewImageUrl,
            imageUrl: p?.imageUrl || r.imageUrl,
            username: p?.username ?? null,
          };
        });
        setData({ query: q, items: enriched });
      } catch {
        if (!cancelled) setData({ query: q, items: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const trimmed = query.trim();
  const alnumCount = (trimmed.match(/[A-Za-z0-9]/g) ?? []).length;
  const tooShort = alnumCount < 3;
  // Only render the fresh result set; stale items stay hidden.
  const fresh = !tooShort && data.query === trimmed ? data.items : [];

  return (
    <>
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-[55] bg-foreground/40 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div ref={wrapperRef} className={cn('relative', open && 'z-[60]')}>
        <Card className={cn('overflow-hidden p-0 py-0', open && 'rounded-b-none')}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            placeholder="Circle, ENS handle or address"
            className="h-14 rounded-none border-0 bg-transparent px-4 text-base focus-visible:ring-0"
          />
        </Card>

        <div
          className={cn(
            'absolute inset-x-0 top-full overflow-hidden transition-all duration-200 ease-out',
            open ? 'max-h-80 opacity-100' : 'pointer-events-none max-h-0 opacity-0',
          )}
        >
          <Card className="overflow-hidden rounded-t-none border-t-0 p-0 py-0 shadow-lg">
            <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tooShort ? 'Recent' : 'Results'}
            </div>

            <ul className="max-h-72 overflow-y-auto py-1">
              {/* Below the alphanumeric minimum — prompt for more input. */}
              {tooShort && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Min 3 characters to search.
                </li>
              )}

              {/* Loading + no result yet for this query. */}
              {!tooShort && loading && fresh.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Searching…
                </li>
              )}

              {/* Empty result set (only show once the active query catches up). */}
              {!tooShort && !loading && data.query === trimmed && fresh.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No matches found.
                </li>
              )}

              {fresh.map((p) => {
                const avatar = p.previewImageUrl ?? p.imageUrl;
                return (
                  <li key={p.address}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(p.name);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                    >
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar}
                          alt=""
                          className="size-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                        >
                          <IconUserFilled className="size-4" />
                        </span>
                      )}
                      <div className="flex flex-1 flex-col leading-tight">
                        <span className="text-sm font-semibold">{p.name || 'Unnamed'}</span>
                        {p.username && (
                          <span className="text-xs text-muted-foreground">@{p.username}</span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {shortenAddress(p.address)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
