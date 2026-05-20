'use client';

import { IconUserFilled } from '@tabler/icons-react';

import { cn, shortenAddress } from '@/lib/utils';
import type { MemberProfile } from '@/lib/circles/trust';
import { type TrustRelationKind } from '@/lib/circles/trust';

const KIND_LABEL: Record<TrustRelationKind, string> = {
  mutual: 'Mutual',
  trusts: 'You trust',
  'trusted-by': 'Trusts you',
  none: 'No trust',
};

const KIND_CLASS: Record<TrustRelationKind, string> = {
  mutual: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  trusts: 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  'trusted-by': 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  none: 'bg-muted text-muted-foreground',
};

export function MemberBadge({
  address,
  profile,
  kind,
  highlight,
}: {
  address: string;
  profile?: MemberProfile;
  kind: TrustRelationKind;
  highlight?: boolean;
}) {
  const img = profile?.previewImageUrl;
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-full border px-2 py-1 text-[11px]',
        highlight ? 'border-primary/60' : 'border-input',
      )}
      title={`${profile?.name ?? address} — ${KIND_LABEL[kind]}`}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="size-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <IconUserFilled className="size-3" />
        </span>
      )}
      <span className="flex flex-col leading-tight">
        <span className="font-semibold">{profile?.name || shortenAddress(address)}</span>
        <span className="font-mono text-[9px] text-muted-foreground">
          {shortenAddress(address)}
        </span>
      </span>
      <span
        className={cn(
          'rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
          KIND_CLASS[kind],
        )}
      >
        {KIND_LABEL[kind]}
      </span>
    </span>
  );
}
