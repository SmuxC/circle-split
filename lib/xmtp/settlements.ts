import type { TripMessage } from './trips';

export type SettlementEdge = { from: string; to: string; amount: number };

export type TripDashboard = {
  grand: number;
  share: number;
  breakdown: { addr: string; paid: number; net: number }[];
  settlements: SettlementEdge[];
};

const EPS = 0.005;

/**
 * Equal-split dashboard for a single trip.
 * - `members` is the current XMTP roster (lowercased).
 * - Non-payers seeded at 0 so they appear in the breakdown / debtor list.
 * - Greedy settlement: largest debtor pays largest creditor until flat.
 */
export function computeTripDashboard(
  messages: TripMessage[],
  members: string[],
): TripDashboard {
  const paid = new Map<string, number>();
  for (const m of members) paid.set(m.toLowerCase(), 0);

  let grand = 0;
  for (const m of messages) {
    if (m.kind !== 'expense') continue;
    const amt = Number(m.payload.amount);
    if (!isFinite(amt)) continue;
    const p = m.payload.payer.toLowerCase();
    paid.set(p, (paid.get(p) ?? 0) + amt);
    grand += amt;
  }

  const addrs = Array.from(paid.keys());
  const share = addrs.length > 0 ? grand / addrs.length : 0;
  const breakdown = addrs.map((addr) => ({
    addr,
    paid: paid.get(addr) ?? 0,
    net: (paid.get(addr) ?? 0) - share,
  }));

  const debtors = breakdown
    .filter((x) => x.net < -EPS)
    .map((x) => ({ addr: x.addr, owe: -x.net }))
    .sort((a, b) => b.owe - a.owe);
  const creditors = breakdown
    .filter((x) => x.net > EPS)
    .map((x) => ({ addr: x.addr, get: x.net }))
    .sort((a, b) => b.get - a.get);

  const settlements: SettlementEdge[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(d.owe, c.get);
    settlements.push({ from: d.addr, to: c.addr, amount: amt });
    d.owe -= amt;
    c.get -= amt;
    if (d.owe < EPS) i++;
    if (c.get < EPS) j++;
  }

  return { grand, share, breakdown, settlements };
}
