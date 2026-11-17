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

A previous revision contained a `.env` file with Supabase project identifiers, URL, and a publishable client key. The security-hardening branch removes it from the proposed branch and adds ignore rules. The file is still present on `main` until the draft PR is merged.

A Supabase publishable key is designed for client use; it is not equivalent to a service-role key. Current-branch GitHub code searches found no matches for `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_`, `postgres://`, `BEGIN PRIVATE KEY`, or `LOVABLE_API_KEY`. This is not a full history-wide scan: because the repository was public, inspect every historical commit and verify that no privileged keys, database credentials, or OAuth secrets were ever committed. Rotate any privileged credential that was exposed. Removing a file in a later commit does not erase earlier Git history.

### Medium priority: CI must remain green

The latest hardening PR has a passing GitHub Actions run: ESLint, TypeScript, Vitest, and production build. Keep these checks required for future changes.

## Dependency maintenance

The hardening branch adds `.github/dependabot.yml` for weekly Bun and GitHub Actions dependency updates. Review Dependabot PRs and keep the CI checks required before merging updates.

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

### Medium priority: gallery signed-URL request volume

The gallery now requests signed URLs for its visible media set in one Storage batch rather than issuing one request per thumbnail. The batch is cached for 50 minutes, while individual media viewers continue to use short-lived signed URLs. This reduces request fan-out for large family galleries without making the bucket public.

### Dependency audit exception under review

The latest Bun audit reported a high-severity Zod advisory affecting versions below 4.6.6. The project currently resolves Zod 3.x through build tooling; upstream has no patched 3.x release. Do not force a global Zod 4 override without checking TanStack tooling compatibility. Track the migration separately and keep the advisory visible until the dependency graph is safely migrated or the affected path is proven unreachable.

### Dependency advisories without a published fix

The dependency graph has been refreshed to patched releases where upstream provides compatible versions, including Vite 8.1.7, shell-quote 1.11.0, js-yaml 4.3.2, launch-editor 2.14.2, nanoid 3.3.18, and source-map-js 1.2.2. The remaining high-severity audit findings include Zod 3.x (no patched 3.x release), Picomatch up to 4.0.7 (the advisory currently lists no fixed release), and brace-expansion 2.1.8 (the registry does not currently provide the newer patched version required by the advisory). Do not force non-existent versions or major-version overrides. Keep these visible in the audit report and re-check them on the next dependency update.
