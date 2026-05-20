'use client';

import { IconChevronLeft } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { CirclesLogo } from '@/components/brand/CirclesLogo';
import { CurrentPage } from '@/components/layout/CurrentPage';
import { NewModePill } from '@/components/layout/NewModePill';
import { WalletStatus } from '@/components/wallet/WalletStatus';
import { BACK_BAR } from '@/lib/header';

export function Header() {
  const pathname = usePathname();
  const back = BACK_BAR[pathname];
  const isNew = pathname === '/new';

  return (
    <header className="col-span-full border-b">
      {/* Mobile header — primary bar; px-6 matches main's p-6 alignment. */}
      <div className="bg-primary text-primary-foreground md:hidden">
        {isNew ? (
          <>
            {/* Row 1: logo (left) + centered title. */}
            <div className="relative flex h-14 items-center px-6">
              <Link href="/" aria-label="Home" className="flex items-center">
                <CirclesLogo width={28} height={28} />
              </Link>
              <div className="pointer-events-none absolute inset-x-0 flex justify-center">
                <span className="text-base font-semibold tracking-tight">Create invoice</span>
              </div>
            </div>
            {/* Row 2: full-width pill. */}
            <div className="px-6 pb-3">
              <NewModePill />
            </div>
          </>
        ) : (
          <div className="relative flex h-20 items-center px-6">
            <div className="flex items-center">
              {back?.back ? (
                <Link
                  href={back.back}
                  aria-label={`Back to ${back.back}`}
                  className="-ml-2 flex size-9 items-center justify-center rounded-full text-primary-foreground transition-colors hover:bg-primary-foreground/10"
                >
                  <IconChevronLeft className="size-6 shrink-0" />
                </Link>
              ) : (
                <Link href="/" aria-label="Home" className="flex items-center">
                  <CirclesLogo width={28} height={28} />
                </Link>
              )}
            </div>
            {back && (
              <div className="pointer-events-none absolute inset-x-0 flex justify-center">
                <span className="text-base font-semibold tracking-tight">{back.label}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop header — px-6 matches main's p-6 alignment. */}
      <div className="hidden h-14 items-center justify-between bg-background px-6 md:flex">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <CirclesLogo width={28} height={28} />
            <span className="hidden sm:inline">Miniapp Boilerplate</span>
          </Link>
          <CurrentPage />
        </div>
        <WalletStatus />
      </div>
    </header>
  );
}
