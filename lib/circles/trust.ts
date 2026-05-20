/**
 * Trust lookups for a single connected wallet.
 *
 * One round-trip via `getAggregatedTrustRelations(me)` populates the three
 * sets we need to badge any counterparty in O(1).
 */
export type TrustRelationKind = 'mutual' | 'trusts' | 'trusted-by' | 'none';

export type TrustContext = {
  me: string;
  mutual: Set<string>; // they ↔ me
  iTrust: Set<string>; // me → them
  theyTrust: Set<string>; // them → me
};

export async function loadTrustContext(me: string): Promise<TrustContext> {
  const { Sdk } = await import('@aboutcircles/sdk');
  const sdk = new Sdk();
  const rows = await sdk.rpc.trust.getAggregatedTrustRelations(
    me as `0x${string}`,
  );
  const mutual = new Set<string>();
  const iTrust = new Set<string>();
  const theyTrust = new Set<string>();
  for (const r of rows) {
    const other = r.objectAvatar.toLowerCase();
    if (r.relation === 'mutuallyTrusts') {
      mutual.add(other);
    } else if (r.relation === 'trusts') {
      iTrust.add(other);
    } else if (r.relation === 'trustedBy') {
      theyTrust.add(other);
    }
  }
  return { me: me.toLowerCase(), mutual, iTrust, theyTrust };
}

export function trustKind(ctx: TrustContext, addr: string): TrustRelationKind {
  const a = addr.toLowerCase();
  if (a === ctx.me) return 'mutual'; // self always renders as trusted
  if (ctx.mutual.has(a)) return 'mutual';
  if (ctx.iTrust.has(a)) return 'trusts';
  if (ctx.theyTrust.has(a)) return 'trusted-by';
  return 'none';
}

export type MemberProfile = {
  address: string;
  name?: string;
  previewImageUrl?: string;
};

export async function loadMemberProfiles(addrs: string[]): Promise<Map<string, MemberProfile>> {
  if (addrs.length === 0) return new Map();
  const { Sdk } = await import('@aboutcircles/sdk');
  const sdk = new Sdk();
  const profiles = (await sdk.rpc.profile.getProfileByAddressBatch(
    addrs.map((a) => a as `0x${string}`),
  )) as ({ name?: string; previewImageUrl?: string; imageUrl?: string } | null)[];
  const map = new Map<string, MemberProfile>();
  addrs.forEach((a, i) => {
    const p = profiles[i];
    map.set(a.toLowerCase(), {
      address: a.toLowerCase(),
      name: p?.name,
      previewImageUrl: p?.previewImageUrl ?? p?.imageUrl,
    });
  });
  return map;
}
