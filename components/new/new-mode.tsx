'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export type NewMode = 'split' | 'request';

type Ctx = { mode: NewMode; setMode: (next: NewMode) => void };

const NewModeContext = createContext<Ctx | null>(null);

export function NewModeProvider({ children }: { children: ReactNode }) {
  // Default to 'request' — the form below the bar is the primary path.
  const [mode, setMode] = useState<NewMode>('request');
  return (
    <NewModeContext.Provider value={{ mode, setMode }}>{children}</NewModeContext.Provider>
  );
}

export function useNewMode(): Ctx {
  const v = useContext(NewModeContext);
  if (!v) throw new Error('useNewMode must be used inside <NewModeProvider>');
  return v;
}
