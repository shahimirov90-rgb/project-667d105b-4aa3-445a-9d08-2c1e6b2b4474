# Database-owner remediation plan

This document records the database work required before the family app can be considered release-ready. It is intentionally documentation only: project rules prohibit hand-editing `drizzle/` or `supabase/migrations/`. Apply schema and privilege changes through the authorized Lovable database-owner workflow, then regenerate schema types and test against a non-production database before deployment.

## Confirmed findings

- **E2EE key writes:** current `family_keys` and `family_key_shares` INSERT policies check family membership but do not require owner/admin role or restrict an ordinary member to their own device.
- **Ciphertext-only text:** current `messages_check` requires non-empty `body` or non-null `media_path`. The app sends encrypted text-only messages with `body = NULL`, `ciphertext/iv/key_version` populated, and no media path. The constraint rejects these rows.
- **Join-request review:** `review_request` updates a conflicting request to rejected and then raises an exception. PostgreSQL rolls back that update.
- **Media deletion:** message DELETE is allowed to admins, while Storage DELETE is limited to the owner of the object path. Deleting another member's media message can orphan the private object.
- **Table privileges:** read-only catalog inspection found `anon` and `authenticated` have unnecessary table privileges (including TRUNCATE/TRIGGER) on all 10 current public tables. RLS is enabled, but it does not apply to TRUNCATE. No direct PostgREST route to execute arbitrary TRUNCATE was established; treat this as least-privilege hardening.
- **SECURITY DEFINER execute grants:** several helper/trigger functions still have PUBLIC/anon EXECUTE grants. Revoke unnecessary access and verify signup/RLS behavior.

See GitHub Issues #6, #7, #8, #13, #19, and #20 for findings and discussion.

## Required database changes

### 1. E2EE key lifecycle and authorization (Issue #6)

- Revoke direct INSERT/UPDATE/DELETE on `family_keys` and `family_key_shares` from browser roles.
- Add narrowly scoped SECURITY DEFINER RPCs with fixed `search_path` and explicit `auth.uid()` checks:
  - Owner/admin may create the next family key version and insert wrapped shares only for active devices in that family.
  - A regular member may add a wrapped share only for a device whose `device_keys.user_id = auth.uid()`; they may not create a version or target another member's device.
  - Existing shares must be immutable; use conflict-safe inserts and do not permit replacement of another device's share.
- Restrict device-key UPDATE to setting `revoked_at` from NULL to a timestamp on the caller's own active device. Do not permit public-key mutation or reactivation.
- When a member is removed or leaves, revoke their active device registrations as part of the trusted membership RPC. On rejoin, require fresh device registration and a new family key version.
- Keep family-key reads limited to current family members.
- Add tests for owner, admin, member, removed member, a member's own new device, another member's device, duplicate version, duplicate share, and revoked device.

### 2. Encrypted text constraint (Issue #13)

Replace the original message-content CHECK so a message is valid when at least one of the following is true:
- legacy non-empty `body` (for existing historical rows),
- non-empty `ciphertext` with the existing complete cipher tuple,
- non-null `media_path`.

Preserve `messages_no_plaintext` for new rows and `messages_cipher_complete`. Do not add plaintext fallbacks or weaken the no-plaintext rule. Inspect existing rows before validating any revised constraint; do not delete or rewrite chat history.

Regression cases:
- encrypted text-only accepted;
- media-only accepted;
- encrypted text + media accepted;
- empty row rejected;
- partial cipher tuple rejected;
- plaintext-only new row rejected;
- legacy historical plaintext rows remain readable if the product intentionally supports them.

### 3. Join request review (Issue #8)

Change the RPC contract so it does not update a row and then raise in the same transaction. Prefer a structured return status (for example, `approved`, `rejected`, `already_member`) and update the TypeScript caller/generated types. If preserving the existing error contract, raise before performing any update and keep the client fallback explicit. Add a database regression test proving the conflicting request reaches a terminal state.

### 4. Message and media deletion (Issue #7)

Implement one trusted server-side operation (RPC plus storage worker/Edge Function as appropriate) that:
- authenticates the caller;
- verifies the caller is the author or an authorized family owner/admin;
- verifies the message belongs to the supplied family;
- validates that the media path matches the message family and original uploader path;
- deletes the storage object and message in a retry-safe order;
- handles missing objects idempotently.

Do not broaden Storage DELETE policy to all family members. Add tests for author, owner, admin, ordinary member, cross-family ID/path, missing object, and retry.

### 5. Least-privilege grants (Issues #19 and #20)

- Revoke unnecessary TRUNCATE, TRIGGER, REFERENCES, and table-level writes from `anon` and `authenticated`.
- Re-grant only the exact table/column privileges required by the app and the RLS policies.
- Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER helpers and trigger functions unless a documented unauthenticated use case exists. Grant authenticated EXECUTE only where RLS or app RPCs require it; keep auth-trigger execution available to the trigger owner.
- Keep all SECURITY DEFINER functions on a fixed trusted search path and fully qualify sensitive object references.
- Add privilege tests using `has_table_privilege` and `has_function_privilege` to ensure browser roles cannot TRUNCATE application tables or call private SECURITY DEFINER helpers.

## Verification and rollout

1. Apply the changes in a disposable/test database first, not production.
2. Run database tests and inspect RLS/policies/grants after the change.
3. Regenerate Supabase TypeScript types through the approved workflow.
4. Run GitHub Actions: ESLint, TypeScript, Vitest, and production build.
5. Test real flows with owner, admin, regular member, newly approved member, removed member, and a second device.
6. Only then schedule production migration/deployment with a backup and rollback plan.

No database writes or migrations were performed as part of this GitHub review.
