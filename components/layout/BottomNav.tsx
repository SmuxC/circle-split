'use client';

import { IconPlusFilled } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
    >
      {/* Border layer — solid border color, dented by the smaller notch. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[oklch(0.85_0_0)] [mask:radial-gradient(41px_at_50%_12px,transparent_40px,#000_41px)] [-webkit-mask:radial-gradient(41px_at_50%_12px,transparent_40px,#000_41px)]"
      />
      {/* Fill layer — sits 1px lower with a 1px-larger notch, so the border
          layer shows through as a 1px line that curves around the dent. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 top-px bg-[oklch(0.94_0_0)] [mask:radial-gradient(42px_at_50%_11px,transparent_41px,#000_42px)] [-webkit-mask:radial-gradient(42px_at_50%_11px,transparent_41px,#000_42px)]"
      />

      {/* Links sit above the masked surface so the FAB is not clipped. */}
      <div className="relative flex">
        {NAV.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;

          if (item.href === '/new') {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-1 flex-col items-center justify-center"
              >
                <span
                  className={cn(
                    'flex size-16 -translate-y-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors transition-transform hover:scale-105',
                    isActive && 'bg-blue-600 hover:bg-blue-700',
                  )}
                >
                  <IconPlusFilled className="size-7 shrink-0" />
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
