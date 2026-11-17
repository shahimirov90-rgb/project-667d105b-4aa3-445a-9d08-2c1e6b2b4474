ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_check CHECK (
  COALESCE(char_length(body), 0) > 0
  OR media_path IS NOT NULL
  OR ciphertext IS NOT NULL
);
