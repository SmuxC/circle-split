'use client';

import { IconReceiptOff } from '@tabler/icons-react';

import { Card } from '@/components/ui/card';

export function BillsDashboard() {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <IconReceiptOff className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">Group expense tracking coming soon.</p>
    </Card>
  );
}
