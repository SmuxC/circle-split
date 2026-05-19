'use client';

import { useEffect, useState } from 'react';

import { useWallet } from '@/hooks/use-wallet';
import { cn } from '@/lib/utils';

export function UserAvatar({ className }: { className?: string }) {
  const { address } = useWallet();
  // Tag the result with the address it was fetched for so stale data from a
  // previous wallet does not leak into the new render.
  const [loaded, setLoaded] = useState<{ address: string; src: string | null } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    (async () => {
      try {
        const { Sdk } = await import('@aboutcircles/sdk');
        const sdk = new Sdk();
        const view = await sdk.rpc.profile.getProfileView(address as `0x${string}`);
        const cid = view?.avatarInfo?.cidV0;
        let src: string | null = null;
        if (cid) {
          const profile = (await sdk.rpc.profile.getProfileByCid(cid)) as
            | { previewImageUrl?: string; imageUrl?: string }
            | null;
          src = profile?.previewImageUrl ?? profile?.imageUrl ?? null;
        }
        if (cancelled) return;
        setLoaded({ address, src });
      } catch {
        // Profile fetch is best-effort — fall back to the initials placeholder.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const src = loaded && loaded.address === address ? loaded.src : null;
  const initials = address ? address.slice(2, 4).toUpperCase() : '·';

  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-muted-foreground',
        className,
      )}
      aria-label={address ? `Avatar for ${address}` : 'No wallet connected'}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
