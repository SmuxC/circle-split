'use client';

import { useNewMode } from '@/components/new/new-mode';
import { Pill } from '@/components/ui/pill';

// Lives inside the mobile top bar on /new. State comes from NewModeContext so
// the page body below can branch on the same value.
export function NewModePill() {
  const { mode, setMode } = useNewMode();
  return (
    <Pill
      variant="bar"
      className="w-full"
      ariaLabel="Split or request"
      first={{ value: 'split', label: 'Split bill' }}
      second={{ value: 'request', label: 'Request payment' }}
      value={mode}
      onChange={setMode}
    />
  );
}
