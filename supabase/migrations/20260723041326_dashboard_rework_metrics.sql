-- All-time applied rework counts for the main Dashboard Overview.
-- Pending/rejected requests and normal first-time approvals are deliberately
-- excluded. New approval-backed edit types automatically fall into Other edits.

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
        from public.campaign_budget_versions
        where lower(kind) = 'top_up'
          and lower(status) in ('approved', 'closed')
      ) + (
        select count(*)
        from public.approval_logs
        where lower(action_type) = 'budget'
          and lower(action) = 'gap reason noted'
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
            'onboarding_edit'
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

revoke all on function public.dashboard_rework_metrics() from public, anon, authenticated;
grant execute on function public.dashboard_rework_metrics() to service_role;
