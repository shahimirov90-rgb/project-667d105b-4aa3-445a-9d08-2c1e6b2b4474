-- Enforce E2EE key-management permissions at the database boundary.
-- Client-side role checks are only UX; they are not an authorization boundary.
DROP POLICY IF EXISTS "family keys insert" ON public.family_keys;
CREATE POLICY "family keys insert" ON public.family_keys
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_family_admin(family_id)
  );

DROP POLICY IF EXISTS "key shares insert" ON public.family_key_shares;
CREATE POLICY "key shares insert" ON public.family_key_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_family_member(family_id)
    AND EXISTS (
      SELECT 1
      FROM public.device_keys d
      JOIN public.family_members fm ON fm.user_id = d.user_id
      WHERE d.id = family_key_shares.device_id
        AND d.revoked_at IS NULL
        AND fm.family_id = family_key_shares.family_id
        AND (
          public.is_family_admin(family_key_shares.family_id)
          OR d.user_id = auth.uid()
        )
    )
  );
