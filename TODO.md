# TODO

## Affiliate group: passive support via splitter

**Goal:** in the `/more` Support section, let user set the CRC splitter group as their **affiliate group** so ~2 CRC/day from their personal-CRC mint flow passively goes to the supported group. Zero cost to user.

**Splitter group address:** `0xb629a1e86F3eFada0F87C83494Da8Cc34C3F84ef`

**Blocker:** how to set affiliate group post-signup is not yet wired.
- `@aboutcircles/sdk-abis` only exposes `affiliateGroup` as a param of `ReferralsModule.claimAccount*` — i.e. set once at passkey-claim time.
- `ReferralsModule.AFFILIATE_GROUP_REGISTRY()` selector (`0xd895e0a3`) reverts on Gnosis RPC against the deployed contract at `0x12105a9B291aF2ABb0591001155A75949b062CE5` — bundled ABI is stale vs deployment.
- No `setAffiliateGroup` / `registerAffiliate` symbol anywhere in `@aboutcircles/sdk`, `sdk-core`, `sdk-invitations`, or `sdk-abis`.

**Next steps:**
1. Get authoritative contract + method signature for "change affiliate group post-claim" (from Circles team, gnosisscan ABI of `0x12105a9B...`, or AffiliateGroupRegistry direct address).
2. Add `SupportGroupCard` next to `DonateCard` in `app/more/page.tsx`:
   - Shows current affiliate group (read from registry).
   - Button "Support this app passively" → `sendTransactions([{ to: <registry>, data: encodeFunctionData(setAffiliateGroup, [SPLITTER]) }])`.
   - Detect already-set state → show "Thanks for supporting" + "Change" option.
3. Standalone-dev fallback message (no host = no `sendTransactions`).
