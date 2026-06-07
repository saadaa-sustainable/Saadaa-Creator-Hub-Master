-- 2026-05-20 — Allow test/old campaigns to be deleted safely
--
-- Docs define posts.campaign_id → campaigns.campaign_id as SET NULL.
-- The live constraint currently blocks campaign deletes when posts reference
-- that campaign. Preserve the posts and clear only their campaign link.

alter table public.posts
  drop constraint if exists posts_campaign_id_fkey;

alter table public.posts
  add constraint posts_campaign_id_fkey
  foreign key (campaign_id)
  references public.campaigns(campaign_id)
  on delete set null;
