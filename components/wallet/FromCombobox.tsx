'use client';

import { IconUserFilled } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn, shortenAddress } from '@/lib/utils';

// `circles_searchProfileByAddressOrName` returns a heterogeneous result list.
// Top-match / address-search rows are enriched with `username`, `displayName`,
// `picture`, etc. Tail rows are bare IPFS profile blobs (`name`,
// `previewImageUrl`). The fields below are the union we read from.
type SearchHit = {
  // Address comes from the enriched shape's `address` (or `id`) field. Text-
  // search tail rows omit it; some carry it inside a `namespaces` map of
  // { [address]: cid }.
  address?: string;
  id?: string;
  namespaces?: Record<string, string>;
  name?: string;
  displayName?: string;
  username?: string | null;
  previewImageUrl?: string;
  imageUrl?: string;
  picture?: string;
};

type SearchResponse = {
  query: string;
  searchType: 'address' | 'text';
  results: SearchHit[];
  hasMore: boolean;
  nextCursor: string | null;
};

type SearchResultRow = {
  address: string;
  name: string; // display name
  username?: string | null;
  avatarUrl?: string;
};

function pickAddress(h: SearchHit): string | null {
  if (h.address) return h.address;
  if (h.id) return h.id;
  if (h.namespaces) {
    const [first] = Object.keys(h.namespaces);
    if (first) return first;
  }
  return null;
}

export function FromCombobox() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  // Tag results with the query that produced them so a stale fetch can't render
  // against a newer input value.
  const [data, setData] = useState<{ query: string; items: SearchResultRow[] }>({
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

  // Debounced Circles profile search. `searchByAddressOrName` handles both
  // free-text names and full 0x… addresses. Gated to ≥3 alphanumeric
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
        // `searchByAddressOrName` text-search response omits `address` /
        // `id` / `namespaces` on all but the top-match rows, so it can't
        // be used alone to list selectable wallets. Pair with
        // `searchProfiles` (which always returns address + cid for every
        // hit) and use `searchByAddressOrName` purely for username /
        // displayName / picture enrichment.
        const [hits, enrichRes] = (await Promise.all([
          sdk.rpc.profile.searchProfiles(q, 20, 0),
          sdk.rpc.profile.searchByAddressOrName(q, 20),
        ])) as unknown as [
          Array<{ address: string; cid?: string; name: string; avatarType?: string }>,
          SearchResponse,
        ];
        if (cancelled) return;

        const enrichments = new Map<string, SearchHit>();
        for (const h of enrichRes.results) {
          const addr = pickAddress(h);
          if (addr) enrichments.set(addr.toLowerCase(), h);
        }

        // Fall back to IPFS profile image for rows without enrichment so
        // every row still gets an avatar.
        const cidsNeedingImage: (string | null)[] = hits.map((h) =>
          enrichments.has(h.address.toLowerCase()) ? null : (h.cid ?? null),
        );
        const ipfs = cidsNeedingImage.some((c) => c)
          ? ((await sdk.rpc.profile.getProfileByCidBatch(cidsNeedingImage)) as unknown as Array<
              { previewImageUrl?: string; imageUrl?: string } | null
            >)
          : [];
        if (cancelled) return;

        const items: SearchResultRow[] = hits.map((h, i) => {
          const enriched = enrichments.get(h.address.toLowerCase());
          const fallbackImg = ipfs[i];
          return {
            address: h.address,
            name: enriched?.displayName ?? enriched?.name ?? h.name,
            username: enriched?.username ?? null,
            avatarUrl:
              enriched?.picture ??
              enriched?.previewImageUrl ??
              enriched?.imageUrl ??
              fallbackImg?.previewImageUrl ??
              fallbackImg?.imageUrl,
          };
        });
        setData({ query: q, items });
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
              {tooShort && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Min 3 characters to search.
                </li>
              )}

              {!tooShort && loading && fresh.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Searching…
                </li>
              )}

              {!tooShort && !loading && data.query === trimmed && fresh.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No matches found.
                </li>
              )}

              {fresh.map((p) => (
                <li key={p.address}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(p.name);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
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
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
