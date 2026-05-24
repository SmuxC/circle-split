'use client';

import { useState, type ReactNode } from 'react';

import { BottomNav } from '@/components/layout/BottomNav';
import { ChatContext, type ChatInfo } from '@/components/layout/ChatContext';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { NewModeProvider } from '@/components/new/new-mode';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: ReactNode }) {
  const [chat, setChat] = useState<ChatInfo | null>(null);

  return (
    <ChatContext.Provider value={{ chat, setChat }}>
      <NewModeProvider>
        <div
          className={cn(
            'grid grid-rows-[auto_1fr] md:grid-cols-[240px_1fr]',
            chat ? 'h-dvh overflow-hidden' : 'min-h-screen',
          )}
        >
          <Header />
          <Sidebar />
          <main
            className={cn(
              chat
                ? 'overflow-hidden p-0'
                : 'overflow-auto p-6 pb-24 md:pb-6',
            )}
          >
            {children}
          </main>
          <BottomNav />
        </div>
      </NewModeProvider>
    </ChatContext.Provider>
  );
}
