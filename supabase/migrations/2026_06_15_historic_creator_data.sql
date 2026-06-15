-- Historic Data archive from legacy "Influencer Tracker" Google Sheet > Creator Data tab.
-- Mirrors sheet columns A-AV (minus AM "Blank") + CB "Historic ReachOut" = 48 source cols.
-- All text: source sheet is dirty/misaligned (e.g. dates like 31/12/1899). Raw mirror, cast in views.
-- Populated by the sheet's "Supabase Sync" Apps Script menu (truncate+load or upsert on post_id).
create table if not exists public.historic_creator_data (
  id bigint generated always as identity primary key,
  sif_id                  text,  -- A  SIF-ID
  post_id                 text,  -- B  POST ID
  campaign_id             text,  -- C  Campaign ID
  nomenclature            text,  -- D  Nomenclature
  entry_date              text,  -- E  DATE
  month                   text,  -- F  Month
  influencer_name         text,  -- G  INFLUENCER NAME
  username                text,  -- H  USERNAME
  ig_handle               text,  -- I  IG Handles
  followers               text,  -- J  FOLLOWERS
  gender                  text,  -- K  GENDER
  influencer_category     text,  -- L  INFLUENCER CATEGORY
  content_name            text,  -- M  Content Name
  content_type            text,  -- N  CONTENT TYPE
  referred_by             text,  -- O  REFERRED BY
  email_id                text,  -- P  EMAIL ID
  contact_no              text,  -- Q  CONTACT NO.
  address                 text,  -- R  ADDRESS
  agency_name             text,  -- S  Agency Name
  location                text,  -- T  LOCATION
  language                text,  -- U  LANGUAGE
  engaged_rate            text,  -- V  ENGAGED RATE
  avg_likes               text,  -- W  AVG. LIKES ON VIDEOS
  reachout_type           text,  -- X  REACHOUT TYPE
  influencer_callout      text,  -- Y  INFLUENCER CALLOUT
  onboard_date            text,  -- Z  ONBOARD DATE
  callout_by              text,  -- AA CALLOUT BY
  collab_type             text,  -- AB COLLAB TYPE
  commercials             text,  -- AC COMMERCIALS
  payment_status          text,  -- AD PAYMENT STATUS
  order_id                text,  -- AE ORDER ID
  order_sent_date         text,  -- AF Order Sent Date
  garments_sent           text,  -- AG GARMENTS SENT
  tracking_id             text,  -- AH TRACKING ID
  order_status            text,  -- AI ORDER STATUS
  order_journey           text,  -- AJ ORDER JOURNEY
  posting_journey         text,  -- AK POSTING JOURNEY
  content_delivery_date   text,  -- AL Content Delivery Date
  post_date               text,  -- AN POST DATE   (AM "Blank" intentionally skipped)
  link_to_post            text,  -- AO LINK TO POST
  collab_duration         text,  -- AP COLLAB DURATION
  content_downloaded_link text,  -- AQ CONTENT DOWNLOADED LINK
  remarks                 text,  -- AR REMARKS
  remarks_2               text,  -- AS REMARKS 2
  raw_dump                text,  -- AT RAW DUMP
  ad_partnership_status   text,  -- AU AD PARTNERSHIP STATUS
  partnership_active_date text,  -- AV PARTNERSHIP ACTIVE DATE
  historic_reachout       text,  -- CB Historic ReachOut
  synced_at               timestamptz not null default now()
);

create index if not exists idx_historic_creator_data_post_id     on public.historic_creator_data (post_id);
create index if not exists idx_historic_creator_data_sif_id      on public.historic_creator_data (sif_id);
create index if not exists idx_historic_creator_data_campaign_id on public.historic_creator_data (campaign_id);

alter table public.historic_creator_data enable row level security;

create policy "historic_creator_data_select_authenticated"
  on public.historic_creator_data for select to authenticated using (true);

create policy "historic_creator_data_service_all"
  on public.historic_creator_data for all to service_role using (true) with check (true);

comment on table public.historic_creator_data is 'Read-only archive of legacy Influencer Tracker > Creator Data tab (sheet cols A-AV minus AM + CB). Populated by the sheet Supabase Sync menu. All text, raw mirror.';
