import { IconAffiliate, IconCashRegister, IconChevronRight, IconReceipt } from '@tabler/icons-react';

import { Card, CardDescription, CardTitle } from '@/components/ui/card';

export default function NewPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {/* Main card — Split bill */}
      <Card className="flex w-full cursor-pointer flex-row items-center gap-4 p-6 transition-colors hover:bg-accent/40">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconReceipt className="size-6" />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <CardTitle className="text-lg">Split bill</CardTitle>
          <CardDescription>
            Divide an expense between trusted Circles users.
          </CardDescription>
        </div>
        <IconChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Card>

      {/* Main card — Create payment request */}
      <Card className="flex w-full cursor-pointer flex-row items-center gap-4 p-6 transition-colors hover:bg-accent/40">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconCashRegister className="size-6" />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <CardTitle className="text-lg">Create payment request</CardTitle>
          <CardDescription>
            Ask one or more people for a specific amount.
          </CardDescription>
        </div>
        <IconChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Card>

      {/* Bar — Create group */}
      <Card className="flex w-full cursor-pointer flex-row items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
        <IconAffiliate className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">Create group</span>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Card>
    </div>
  );
}
