-- ----------------------------------------------------------------------------
-- Fix (found by workflow validation): candidate ranking let availability
-- cancel the skill bonus. An over-allocated person has negative availability
-- (e.g. 150% committed → −50), so a candidate WITH the requested skill could
-- score 100 − 50 = 50 and rank BELOW an idle candidate with no matching
-- skills (0 + 100 = 100) — the opposite of the documented "skill match
-- dominates" rule. Ranking is now lexicographic: matched skills first,
-- availability only breaks ties. The score column stays for display,
-- computed with availability clamped to [0, 100] so it can no longer flip
-- the order it is shown in.
-- ----------------------------------------------------------------------------
create or replace function public.suggest_candidates(p_request_id uuid)
returns table (
  user_id uuid,
  full_name text,
  title text,
  matched_skills text[],
  skill_match_count int,
  committed_allocation_pct numeric,
  available_pct numeric,
  score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  req public.staffing_requests%rowtype;
  window_end date;
begin
  if not (public.has_role('resourcing') or public.has_role('pm')) then
    raise exception 'Resourcing role required' using errcode = '42501';
  end if;

  select * into req from public.staffing_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found';
  end if;
  window_end := req.start_date + coalesce(req.duration_weeks, 12) * 7;

  return query
  select
    p.id,
    p.full_name,
    p.title,
    coalesce(m.matched, '{}') as matched_skills,
    coalesce(array_length(m.matched, 1), 0) as skill_match_count,
    round(coalesce(alloc.pct, 0), 1) as committed_allocation_pct,
    round(100 - coalesce(alloc.pct, 0), 1) as available_pct,
    round(coalesce(array_length(m.matched, 1), 0) * 100
          + greatest(least(100 - coalesce(alloc.pct, 0), 100), 0), 1) as score
  from public.profiles p
  left join lateral (
    select array_agg(s.name order by s.name) as matched
    from public.person_skills ps
    join public.skills s on s.id = ps.skill_id
    where ps.user_id = p.id
      and s.name = any (req.skills)
      and (req.seniority is null or ps.level >= req.seniority)
  ) m on true
  left join lateral (
    select sum(a.allocation_pct) as pct
    from public.assignments a
    where a.user_id = p.id
      and a.start_date <= window_end
      and (a.end_date is null or a.end_date >= req.start_date)
  ) alloc on true
  where p.active
  order by
    coalesce(array_length(m.matched, 1), 0) desc,   -- skills dominate, always
    100 - coalesce(alloc.pct, 0) desc,              -- availability breaks ties
    p.full_name
  limit 10;
end;
$$;
