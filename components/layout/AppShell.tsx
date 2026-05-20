import type { ReactNode } from 'react';

import { BottomNav } from '@/components/layout/BottomNav';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { NewModeProvider } from '@/components/new/new-mode';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <NewModeProvider>
      <div className="grid min-h-screen grid-rows-[auto_1fr] md:grid-cols-[240px_1fr]">
        <Header />
        <Sidebar />
        <main className="overflow-auto p-6 pb-24 md:pb-6">{children}</main>
        <BottomNav />
      </div>
    </NewModeProvider>
  );
}
