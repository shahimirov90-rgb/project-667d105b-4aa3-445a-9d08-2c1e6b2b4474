# Security review notes

This document records implementation-level observations from the current repository. It is not a penetration test or a guarantee of security.

## Security invariants

- Family membership changes must go through the existing SECURITY DEFINER RPCs. Client code must not directly grant membership, change roles, or approve join requests.
- Keep `family-media` and `avatars` private. Deliver media through short-lived signed URLs.
- Never put a Supabase service-role key, database password, OAuth client secret, or other privileged credential in browser code, Vite variables, committed files, or logs.
- Chat plaintext and raw family encryption keys must never be sent to the database. Encrypted message records should keep `messages.body` null.
- Device private keys should remain non-extractable and local to the device.

## Findings requiring attention

### High priority: family-key writes are available to every authenticated family member

The current database RLS policies observed during review allow an authenticated family member to:

- insert a row into `family_keys` when `created_by = auth.uid()` and they are a family member;
- insert `family_key_shares` for active devices belonging to members of that family.

This is broader than a design where only an explicitly authorized key-management operation can create a new family-key version and distribute it. A malicious or compromised member could interfere with key-version creation or key distribution.

**Required follow-up:** have the database owner review and redesign these write policies. Prefer narrowly scoped SECURITY DEFINER RPCs with explicit authorization, validation of the target device and family membership, and protection against competing or unauthorized key-version creation. Keep the browser from directly inserting key metadata or share rows. Do not implement this by editing migrations outside the project's Lovable-managed database workflow.

### High priority: review repository history for environment-file exposure

A previous revision contained a `.env` file with Supabase project identifiers, URL, and a publishable client key. The current security-hardening pull request removes it from the proposed branch and adds ignore rules.

A Supabase publishable key is designed for client use; it is not equivalent to a service-role key. However, because the repository was public, inspect the full Git history and verify that no privileged keys, database credentials, or OAuth secrets were ever committed. Rotate any privileged credential that was exposed. Removing a file in a later commit does not erase earlier Git history.

### Medium priority: verify the CI workflow actually runs

The repository has lint and Vitest scripts and a GitHub Actions workflow is proposed in the security-hardening pull request. At the time of review, no workflow run was returned for that PR commit. Confirm Actions are enabled and that a PR run completes before treating the checks as operational.

## Manual release checklist

- [ ] Verify RLS for every table and storage bucket using separate accounts from different families.
- [ ] Confirm a non-member cannot read family profiles, messages, signed media, device public keys, or key shares.
- [ ] Confirm an ordinary member cannot create key versions or distribute keys outside the authorized flow.
- [ ] Confirm removed members and revoked devices cannot obtain newly rotated family keys.
- [ ] Confirm chat requests never send plaintext in `messages.body`.
- [ ] Confirm no privileged credentials exist in the current tree or Git history.
- [ ] Run lint, tests, and a production build in CI.
- [ ] Test signup, email confirmation, login, logout, OAuth callback, invite approval, and expired sessions.

## Scope and limitations

This review was based on selected source files and live database policy metadata. It did not include a complete source audit, authenticated end-to-end attack testing, dependency audit, production configuration review, or credential-history scan. Findings should be verified before release.
