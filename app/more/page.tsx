import { ProfileLookup } from '@/components/profile/ProfileLookup';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectionCard } from '@/components/wallet/ConnectionCard';
import { SignInDemo } from '@/components/wallet/SignInDemo';

export default function MorePage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">More</h1>
        <p className="text-sm text-muted-foreground">
          Boilerplate demos — wallet connection, sign-in, profile lookup, and
          transaction samples.
        </p>
      </div>

      <ConnectionCard />

      <SignInDemo />

      <section className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">Profile lookup</h2>
        <ProfileLookup />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">Actions</h2>
        <Card>
          <CardHeader>
            <CardTitle>Send transactions through the host</CardTitle>
            <CardDescription>
              Import <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">sendTransactions</code>{' '}
              from <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">@aboutcircles/miniapp-sdk</code> inside a client
              component and pass an array of <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{'{ to, data?, value? }'}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed">{`'use client';
import { sendTransactions } from '@aboutcircles/miniapp-sdk';

const hashes = await sendTransactions([
  { to: '0x…', data: '0x…', value: '0' },
]);`}</pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
