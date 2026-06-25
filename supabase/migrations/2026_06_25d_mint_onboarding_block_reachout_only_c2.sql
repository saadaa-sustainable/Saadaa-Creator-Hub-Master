-- Refine collab minting: a HISTORIC creator who was only ever reached out (has
-- historic_posts rows but no real collab) starts the first onboard at C2 — the
-- reach-out batch is an implicit C1 (reach-out posts stay NULL collab). Brand-new
-- creators (no history) still start at C1; creators with real collabs continue at
-- max+1. See memory project_collab_deliverable_numbering_rule. Applied via MCP.
create or replace function public.mint_onboarding_block(p_inf_id text, p_order_id text, p_deliverable_count integer)
 RETURNS TABLE(collab_number integer, collab_id text, start_post_number integer, post_id_base text)
 LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  v_oid text := lower(btrim(regexp_replace(coalesce(p_order_id,''), '^#+', '')));
  v_cn int; v_maxc int; v_maxp int;
begin
  if p_inf_id is null or p_inf_id = '' then raise exception 'mint_onboarding_block: p_inf_id required'; end if;
  perform pg_advisory_xact_lock(hashtext('reachout-inf:' || p_inf_id));
  if v_oid <> '' then
    select p.collab_number into v_cn from posts p
    where p.inf_id = p_inf_id and p.collab_number is not null
      and lower(btrim(regexp_replace(coalesce(p.order_id,''), '^#+', ''))) = v_oid
    order by p.collab_number asc limit 1;
  end if;
  if v_cn is null then
    select max(u.cn) into v_maxc from (
      select p.collab_number cn from posts p          where p.inf_id = p_inf_id and p.collab_number is not null
      union all
      select h.collab_number cn from historic_posts h where h.inf_id = p_inf_id and h.collab_number is not null
    ) u;
    if v_maxc is not null then v_cn := v_maxc + 1;
    elsif exists (select 1 from historic_posts h where h.inf_id = p_inf_id) then v_cn := 2;
    else v_cn := 1;
    end if;
  end if;
  select coalesce(max(u.pn), 0) into v_maxp from (
    select p.post_number pn from posts p          where p.inf_id = p_inf_id
    union all
    select h.post_number pn from historic_posts h where h.inf_id = p_inf_id
  ) u;
  collab_number := v_cn; collab_id := p_inf_id || '-C' || v_cn;
  start_post_number := v_maxp + 1; post_id_base := p_inf_id || '-P' || (v_maxp + 1);
  return next;
end;
$function$;
