drop policy "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert to authenticated with check (
  user_id = auth.uid() and public.is_family_member(family_id)
  and (media_path is null or media_path like family_id::text || '/' || auth.uid()::text || '/%')
  and (messages.reply_to_id is null or exists(select 1 from public.messages m where m.id = messages.reply_to_id and m.family_id = messages.family_id))
);