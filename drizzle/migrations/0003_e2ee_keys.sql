CREATE TABLE public.device_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  public_key jsonb NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.device_keys TO authenticated;
GRANT ALL ON public.device_keys TO service_role;
ALTER TABLE public.device_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device keys read" ON public.device_keys FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.shares_family(user_id));
CREATE POLICY "device keys insert own" ON public.device_keys FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND revoked_at IS NULL);
CREATE POLICY "device keys revoke own" ON public.device_keys FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.family_keys (
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, version)
);
GRANT SELECT, INSERT ON public.family_keys TO authenticated;
GRANT ALL ON public.family_keys TO service_role;
ALTER TABLE public.family_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family keys read" ON public.family_keys FOR SELECT TO authenticated USING (public.is_family_member(family_id));
CREATE POLICY "family keys insert" ON public.family_keys FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.is_family_member(family_id));

CREATE TABLE public.family_key_shares (
  family_id uuid NOT NULL,
  version integer NOT NULL,
  device_id uuid NOT NULL REFERENCES public.device_keys(id) ON DELETE CASCADE,
  eph_public_key jsonb NOT NULL,
  iv text NOT NULL,
  wrapped_key text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, version, device_id),
  FOREIGN KEY (family_id, version) REFERENCES public.family_keys(family_id, version) ON DELETE CASCADE
);
GRANT SELECT, INSERT ON public.family_key_shares TO authenticated;
GRANT ALL ON public.family_key_shares TO service_role;
ALTER TABLE public.family_key_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "key shares read" ON public.family_key_shares FOR SELECT TO authenticated USING (public.is_family_member(family_id));
CREATE POLICY "key shares insert" ON public.family_key_shares FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND public.is_family_member(family_id) AND EXISTS (
    SELECT 1 FROM public.device_keys d JOIN public.family_members fm ON fm.user_id = d.user_id
    WHERE d.id = family_key_shares.device_id AND d.revoked_at IS NULL AND fm.family_id = family_key_shares.family_id));

ALTER TABLE public.messages ADD COLUMN ciphertext text, ADD COLUMN iv text, ADD COLUMN key_version integer;
ALTER TABLE public.messages ADD CONSTRAINT messages_no_plaintext CHECK (body IS NULL) NOT VALID;
ALTER TABLE public.messages ADD CONSTRAINT messages_cipher_complete CHECK ((ciphertext IS NULL AND iv IS NULL AND key_version IS NULL) OR (ciphertext IS NOT NULL AND iv IS NOT NULL AND key_version IS NOT NULL));
COMMENT ON COLUMN public.messages.body IS 'DEPRECATED: legacy plaintext; new messages store ciphertext';