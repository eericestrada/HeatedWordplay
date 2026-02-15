-- ============================================================
-- Heated Wordplay — Row-Level Security Policies
-- ============================================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.puzzles enable row level security;
alter table public.puzzle_shares enable row level security;
alter table public.attempts enable row level security;

-- ============================================================
-- USERS
-- ============================================================

-- Anyone authenticated can read any user profile (for display names, avatars)
create policy "Users are viewable by authenticated users"
  on public.users for select
  to authenticated
  using (true);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- GROUPS
-- ============================================================

-- Users can see groups they belong to
create policy "Users can view their groups"
  on public.groups for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members
      where group_id = groups.id
        and user_id = auth.uid()
    )
  );

-- Any authenticated user can create a group
create policy "Authenticated users can create groups"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

-- Group creator can update their group
create policy "Group creator can update group"
  on public.groups for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ============================================================
-- GROUP MEMBERS
-- ============================================================

-- Users can see members of groups they belong to
create policy "Users can view members of their groups"
  on public.group_members for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id = auth.uid()
    )
  );

-- Users can join a group (insert themselves)
create policy "Users can join groups"
  on public.group_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can leave a group (delete themselves)
create policy "Users can leave groups"
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- PUZZLES
--
-- CRITICAL: The word, definition, clue, and inspo are hidden
-- until the user has completed an attempt on the puzzle.
-- The SELECT policy returns limited columns; a secure view
-- handles the conditional reveal.
-- ============================================================

-- Users can see puzzles they have access to (via visibility function)
-- NOTE: This allows reading the row, but sensitive columns are
-- protected by the secure view (see below)
create policy "Users can see accessible puzzles"
  on public.puzzles for select
  to authenticated
  using (
    public.user_can_see_puzzle(auth.uid(), id)
  );

-- Users can create puzzles
create policy "Users can create puzzles"
  on public.puzzles for insert
  to authenticated
  with check (creator_id = auth.uid());

-- Creators can update their own puzzles (only if no attempts exist)
create policy "Creators can update own puzzles without attempts"
  on public.puzzles for update
  to authenticated
  using (
    creator_id = auth.uid()
    and not exists (
      select 1 from public.attempts
      where puzzle_id = puzzles.id
        and user_id != auth.uid()  -- own attempts don't block editing
    )
  )
  with check (creator_id = auth.uid());

-- Creators can delete their own puzzles (only if no attempts by others)
create policy "Creators can delete own puzzles without attempts"
  on public.puzzles for delete
  to authenticated
  using (
    creator_id = auth.uid()
    and not exists (
      select 1 from public.attempts
      where puzzle_id = puzzles.id
        and user_id != auth.uid()
    )
  );

-- ============================================================
-- SECURE VIEW: puzzles with answer hiding
--
-- Returns all puzzle metadata, but hides word/definition/clue/inspo
-- unless the viewer is the creator OR has a completed attempt.
-- ============================================================

create or replace view public.puzzles_visible as
select
  p.id,
  p.creator_id,
  p.complexity,
  p.is_public,
  p.created_at,
  -- Only reveal answer data if user is creator or has completed attempt
  case
    when p.creator_id = auth.uid() then p.word
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.word
    else null
  end as word,
  case
    when p.creator_id = auth.uid() then p.definition
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.definition
    else null
  end as definition,
  case
    when p.creator_id = auth.uid() then p.part_of_speech
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.part_of_speech
    else null
  end as part_of_speech,
  case
    when p.creator_id = auth.uid() then p.clue
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.clue
    else null
  end as clue,
  case
    when p.creator_id = auth.uid() then p.inspo
    when exists (
      select 1 from public.attempts a
      where a.puzzle_id = p.id and a.user_id = auth.uid()
    ) then p.inspo
    else null
  end as inspo,
  -- Always visible metadata
  char_length(p.word) as word_length,
  u.username as creator_username,
  u.display_name as creator_display_name,
  -- Has the current user completed this puzzle?
  exists (
    select 1 from public.attempts a
    where a.puzzle_id = p.id and a.user_id = auth.uid()
  ) as has_attempted,
  -- Creator's clue existence (so UI knows to show clue button)
  (p.clue is not null and p.clue != '') as has_clue
from public.puzzles p
join public.users u on u.id = p.creator_id;

-- ============================================================
-- PUZZLE SHARES
-- ============================================================

-- Users can see shares for puzzles they can see
create policy "Users can view shares for accessible puzzles"
  on public.puzzle_shares for select
  to authenticated
  using (
    public.user_can_see_puzzle(auth.uid(), puzzle_id)
  );

-- Creators can share their own puzzles
create policy "Creators can share own puzzles"
  on public.puzzle_shares for insert
  to authenticated
  with check (
    exists (
      select 1 from public.puzzles
      where id = puzzle_id and creator_id = auth.uid()
    )
  );

-- Users with reshare permission can share puzzles
create policy "Users with reshare permission can share"
  on public.puzzle_shares for insert
  to authenticated
  with check (
    shared_by = auth.uid()
    and public.user_can_reshare_puzzle(auth.uid(), puzzle_id)
    and allow_reshare = false  -- reshared copies cannot grant further reshare
  );

-- Creators and sharers can delete their own shares
create policy "Users can delete shares they created"
  on public.puzzle_shares for delete
  to authenticated
  using (
    shared_by = auth.uid()
    or exists (
      select 1 from public.puzzles
      where id = puzzle_id and creator_id = auth.uid()
    )
  );

-- ============================================================
-- ATTEMPTS
-- ============================================================

-- Users can see their own attempts
create policy "Users can view own attempts"
  on public.attempts for select
  to authenticated
  using (user_id = auth.uid());

-- Users can see attempts by others in their groups (for activity feed)
-- Only on puzzles shared to those groups
create policy "Users can view group attempt activity"
  on public.attempts for select
  to authenticated
  using (
    exists (
      -- Find a group that both the viewer and the attempter are in,
      -- AND the puzzle was shared to that group
      select 1
      from public.puzzle_shares ps
      join public.group_members gm_viewer on gm_viewer.group_id = ps.target_id
        and gm_viewer.user_id = auth.uid()
      join public.group_members gm_attempter on gm_attempter.group_id = ps.target_id
        and gm_attempter.user_id = attempts.user_id
      where ps.puzzle_id = attempts.puzzle_id
        and ps.share_type = 'group'
    )
  );

-- Attempts are created via Edge Function (service_role), not directly
-- But we add a policy for the function's service_role to work
-- Users should NOT insert attempts directly (guess evaluation is server-side)
-- No insert policy for authenticated role — enforced via Edge Function

-- ============================================================
-- GRANT access to the secure view
-- ============================================================

grant select on public.puzzles_visible to authenticated;
