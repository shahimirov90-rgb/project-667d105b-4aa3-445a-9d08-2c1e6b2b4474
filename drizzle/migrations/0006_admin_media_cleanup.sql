-- Allow family owners/admins to clean up media attached to messages they moderate.
-- Members can still delete only files they uploaded themselves.
DROP POLICY IF EXISTS "media delete own" ON storage.objects;
CREATE POLICY "media delete own or admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'family-media'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR public.is_family_admin(((storage.foldername(name))[1])::uuid)
    )
  );
