create unique index if not exists email_logs_delivery_reminder_claim_uidx
  on public.email_logs (post_id)
  where email_type = 'delivery_reminder_claim' and post_id is not null;

create unique index if not exists email_logs_accounts_digest_claim_uidx
  on public.email_logs (post_id)
  where email_type = 'accounts_payable_digest' and post_id is not null;

create or replace function public.accounts_payable_digest_rows(p_cycle_date date)
returns table(
  post_id text,
  collab_id text,
  inf_id text,
  creator_name text,
  username text,
  outstanding numeric,
  status text,
  due_date date,
  bank_name text,
  bank_number text,
  ifsc text
)
language sql
stable
security definer
set search_path = public
as $$
  with drafts as (
    select distinct on (coalesce(nullif(btrim(p.collab_id), ''), p.post_id))
      p.post_id,
      p.collab_id,
      p.inf_id,
      p.username,
      p.amount,
      p.status,
      p.due_date,
      p.bank_name,
      p.bank_number,
      p.ifsc
    from public.payments p
    where p.estimated_payable_date = p_cycle_date
      and nullif(btrim(p.utr), '') is null
      and p.status in ('Due', 'Not Due', 'Partial')
      and p.post_id is not null
    order by coalesce(nullif(btrim(p.collab_id), ''), p.post_id),
      p.created_at desc nulls last,
      p.id desc
  ),
  paid as (
    select
      p.post_id,
      coalesce(sum(p.amount), 0)::numeric as paid_so_far
    from public.payments p
    join drafts d on d.post_id = p.post_id
    where nullif(btrim(p.utr), '') is not null
    group by p.post_id
  )
  select
    d.post_id,
    d.collab_id,
    d.inf_id,
    coalesce(
      nullif(btrim(c.inf_name), ''),
      nullif(btrim(c.username), ''),
      nullif(btrim(d.username), ''),
      d.inf_id
    ) as creator_name,
    coalesce(
      nullif(btrim(c.username), ''),
      nullif(btrim(d.username), '')
    ) as username,
    greatest(
      coalesce(d.amount, 0) - coalesce(paid.paid_so_far, 0),
      0
    )::numeric as outstanding,
    d.status,
    d.due_date,
    d.bank_name,
    d.bank_number,
    d.ifsc
  from drafts d
  left join paid on paid.post_id = d.post_id
  left join public.creators c on c.inf_id = d.inf_id
  left join public.posts post_row on post_row.post_id = d.post_id
  where lower(btrim(coalesce(post_row.workflow_status, '')))
      not in ('offboarded', 'offboarding')
    and greatest(
      coalesce(d.amount, 0) - coalesce(paid.paid_so_far, 0),
      0
    ) > 0.0001
  order by d.due_date nulls last, d.collab_id nulls last, d.post_id;
$$;

revoke all on function public.accounts_payable_digest_rows(date)
  from public, anon, authenticated;
grant execute on function public.accounts_payable_digest_rows(date)
  to service_role;

-- Budget top-ups and gap annotations are routine operations, not rework.
-- Count budget corrections only when an explicit budget_edit audit is applied.
create or replace function public.dashboard_rework_metrics()
returns table(label text, value bigint, color text, sort_order integer)
language sql
stable
security definer
set search_path = public
as $$
  with metrics(label, value, color, sort_order) as (
    select
      'Campaign edits',
      (
        select count(*)
        from public.approval_logs
        where (
          lower(action_type) = 'campaign edit'
          and (
            lower(action) = 'approved'
            or lower(action) like 'edited%'
          )
        ) or (
          lower(action_type) = 'budget'
          and lower(action) = 'submitted'
          and lower(coalesce(notes, '')) like
            're-applied for budget approval after rejection%'
        )
      ),
      '#B57514',
      1
    union all
    select
      'Reach Out edits',
      (
        select count(*)
        from public.approval_logs
        where replace(lower(action_type), ' ', '_') = 'reachout_edit'
          and lower(action) = 'approved'
      ),
      '#3B6FD4',
      2
    union all
    select
      'Onboarding edits',
      (
        select count(*)
        from public.approval_logs
        where replace(lower(action_type), ' ', '_') = 'onboarding_edit'
          and lower(action) = 'approved'
      ),
      '#7B4FBF',
      3
    union all
    select
      'Budget edits',
      (
        select count(*)
        from public.approval_logs
        where replace(lower(action_type), ' ', '_') = 'budget_edit'
          and (
            lower(action) in ('approved', 'applied')
            or lower(action) like 'edited%'
          )
      ),
      '#B54F7A',
      4
    union all
    select
      'Sheet edits',
      (select count(*) from public.cell_edits),
      '#4F7C4D',
      5
    union all
    select
      'Other edits',
      (
        select count(*)
        from public.user_audit_log
        where lower(action) in ('edit', 'role_change')
      ) + (
        select count(*)
        from public.approval_logs
        where lower(action_type) like '%edit%'
          and replace(lower(action_type), ' ', '_') not in (
            'campaign_edit',
            'reachout_edit',
            'onboarding_edit',
            'budget_edit'
          )
          and (
            lower(action) in ('approved', 'applied')
            or lower(action) like 'edited%'
          )
      ),
      '#6E695E',
      6
  )
  select metrics.label, metrics.value, metrics.color, metrics.sort_order
  from metrics
  order by metrics.sort_order;
$$;

revoke all on function public.dashboard_rework_metrics()
  from public, anon, authenticated;
grant execute on function public.dashboard_rework_metrics()
  to service_role;
