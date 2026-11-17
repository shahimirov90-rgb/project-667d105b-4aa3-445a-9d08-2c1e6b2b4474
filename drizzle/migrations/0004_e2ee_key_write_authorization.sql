-- Tighten E2EE key-management writes without changing the existing client protocol.
-- Family key versions are security-sensitive: only owners/admins may create them.
DROP POLICY IF EXISTS "family keys insert" ON public.family_keys;
CREATE POLICY "family keys insert admins" ON public.family_keys
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_family_admin(family_id)
  );

-- A regular member may provision a wrapped key for their own device only.
-- Owners/admins may distribute keys to any active device in their family.
DROP POLICY IF EXISTS "key shares insert" ON public.family_key_shares;
CREATE POLICY "key shares insert authorized devices" ON public.family_key_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.device_keys d
      JOIN public.family_members fm ON fm.user_id = d.user_id
      WHERE d.id = family_key_shares.device_id
        AND d.revoked_at IS NULL
        AND fm.family_id = family_key_shares.family_id
        AND (
          fm.role IN ('owner', 'admin')
          OR d.user_id = auth.uid()
        )
    )
  );

-- Device public keys are immutable after registration. Authenticated users may
-- revoke an active device, but cannot edit its public key or reactivate it.
DROP POLICY IF EXISTS "device keys revoke own" ON public.device_keys;
REVOKE UPDATE ON public.device_keys FROM authenticated;
GRANT UPDATE (revoked_at) ON public.device_keys TO authenticated;
CREATE POLICY "device keys revoke own active" ON public.device_keys
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND revoked_at IS NULL)
  WITH CHECK (user_id = auth.uid() AND revoked_at IS NOT NULL);
