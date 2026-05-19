'use client';

import { IconPlusFilled } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  const newItem = NAV.find((item) => item.href === '/new');
  const others = NAV.filter((item) => item.href !== '/new');

  return (
    <aside className="hidden border-r bg-sidebar p-2 md:block">
      <nav className="flex flex-col gap-1">
        {newItem && (
          <Link
            href={newItem.href}
            aria-current={pathname.startsWith(newItem.href) ? 'page' : undefined}
            className={cn(
              'mb-2 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90',
              pathname.startsWith(newItem.href) && 'ring-2 ring-ring ring-offset-2 ring-offset-sidebar',
            )}
          >
            <IconPlusFilled className="size-4 shrink-0" />
            {newItem.label}
          </Link>
        )}
        {others.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/60',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
