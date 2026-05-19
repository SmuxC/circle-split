'use client';

import { IconChevronLeft } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { CirclesLogo } from '@/components/brand/CirclesLogo';
import { CurrentPage } from '@/components/layout/CurrentPage';
import { UserAvatar } from '@/components/wallet/UserAvatar';
import { WalletStatus } from '@/components/wallet/WalletStatus';
import { BACK_BAR } from '@/lib/header';
import { cn } from '@/lib/utils';

export function Header() {
  const pathname = usePathname();
  const back = BACK_BAR[pathname];

  return (
    <header className="col-span-full flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        {back && (
          <Link
            href={back.back}
            aria-label={`Back to ${back.back}`}
            className="flex items-center gap-1 text-sm font-medium text-foreground md:hidden"
          >
            <IconChevronLeft className="size-5 shrink-0" />
            <span>{back.label}</span>
          </Link>
        )}
        <Link
          href="/"
          className={cn(
            'flex items-center gap-2 font-semibold tracking-tight',
            back && 'hidden md:flex',
          )}
        >
          <CirclesLogo width={28} height={28} />
          <span className="hidden sm:inline">Miniapp Boilerplate</span>
        </Link>
        <CurrentPage />
      </div>
      <div className="flex items-center gap-2">
        <UserAvatar className="md:hidden" />
        <div className="hidden md:block">
          <WalletStatus />
        </div>
      </div>
    </header>
  );
}
