-- READ-ONLY verification queries for the database-owner workflow.
-- This file intentionally contains SELECT statements only. It does not change schema or data.

-- 1) RLS must be enabled on every application table in public.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 2) Review E2EE, membership, message, profile, and family RLS policies.
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN (
  'family_keys', 'family_key_shares', 'device_keys', 'families',
  'family_members', 'family_invites', 'join_requests',
  'messages', 'message_reactions', 'profiles'
))
OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- 3) Inspect table-level and column-level write grants on sensitive tables.
-- Expected: family_keys/family_key_shares are read-only to browser roles;
-- device_keys permits own-device INSERT and UPDATE only on revoked_at.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('family_keys', 'family_key_shares', 'device_keys', 'family_members')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT grantee, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'device_keys'
  AND grantee IN ('anon', 'authenticated') AND privilege_type = 'UPDATE'
ORDER BY grantee, column_name;

-- 4) Browser roles must not have TRUNCATE/TRIGGER/REFERENCES privileges.
-- Review every true result; RLS does not protect TRUNCATE.
SELECT c.relname AS table_name,
  has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
  has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_truncate,
  has_table_privilege('anon', c.oid, 'TRIGGER') AS anon_trigger,
  has_table_privilege('authenticated', c.oid, 'TRIGGER') AS authenticated_trigger,
  has_table_privilege('anon', c.oid, 'REFERENCES') AS anon_references,
  has_table_privilege('authenticated', c.oid, 'REFERENCES') AS authenticated_references
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 5) SECURITY DEFINER functions should not be executable by PUBLIC/anon unless documented.
SELECT p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  p.proconfig AS function_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname;

-- 6) Message constraints must permit ciphertext-only text rows and preserve cipher completeness.
SELECT c.conname, pg_get_constraintdef(c.oid) AS definition, c.convalidated
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'messages' AND c.contype = 'c'
ORDER BY c.conname;

-- 7) The join-request RPC must not update and then raise in the same transaction.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'review_request';

-- 8) Storage buckets should remain private and retain expected limits.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;
