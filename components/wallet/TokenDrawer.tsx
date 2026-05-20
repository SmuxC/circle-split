'use client';

import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { shortenAddress } from '@/lib/utils';

export type Token = {
  symbol: string;
  name: string;
  cashtag: string;
  address: string;
};

// Placeholder list. Real Gnosis Chain addresses for the on-chain tokens, dummy
// 0x… filler for the fiat-style entries — swap for a registry call later.
export const TOKENS: Token[] = [
  {
    symbol: 'EUR',
    name: 'Euro',
    cashtag: '$EUR',
    address: '0x0000000000000000000000000000000000000001',
  },
  {
    symbol: 'CRC',
    name: 'Circles',
    cashtag: '$CRC',
    address: '0x0000000000000000000000000000000000000002',
  },
  {
    symbol: 'xDAI',
    name: 'xDAI',
    cashtag: '$xDAI',
    address: '0x0000000000000000000000000000000000000000',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    cashtag: '$USDC',
    address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    cashtag: '$USDT',
    address: '0x4ECaBa5870353805a9F068101A40E0f32ed605C6',
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    cashtag: '$ETH',
    address: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    cashtag: '$WBTC',
    address: '0x8e5bBbb09Ed1ebdE8674Cda39A0c169401db4252',
  },
];

export function TokenDrawer({
  value,
  onChange,
}: {
  value: Token;
  onChange: (next: Token) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? TOKENS.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.cashtag.toLowerCase().includes(q),
      )
    : TOKENS;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Change currency"
            className="flex w-28 shrink-0 items-center justify-center gap-2 border-l border-border px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {/* Token logo placeholder. */}
            <span aria-hidden className="size-5 shrink-0 rounded-full bg-muted-foreground/25" />
            <span>{value.symbol}</span>
            <IconChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[80vh] gap-3 rounded-t-2xl p-4 duration-300 data-[side=bottom]:data-starting-style:translate-y-full data-[side=bottom]:data-ending-style:translate-y-full"
      >
        {/* Drag handle indicator. */}
        <div
          aria-hidden
          className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/30"
        />

        <SheetHeader className="p-0">
          <SheetTitle>Select token</SheetTitle>
        </SheetHeader>

        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tokens"
            className="h-10 pl-9"
          />
        </div>

        <ul className="flex flex-col overflow-y-auto">
          {filtered.map((t) => (
            <li key={t.symbol}>
              <button
                type="button"
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <span aria-hidden className="size-8 shrink-0 rounded-full bg-muted-foreground/20" />
                <div className="flex flex-1 flex-col leading-tight">
                  <span className="text-sm font-semibold">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.cashtag}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {shortenAddress(t.address)}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No tokens found.
            </li>
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
