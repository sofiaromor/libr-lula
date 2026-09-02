# Public collections rollout

This feature is stacked on `feature/library-spine-view` and is intentionally isolated from the private library redesign.

## Before production

1. Review `supabase/library-collections-v18.sql` and RLS.
2. Apply the migration only with explicit human approval.
3. Verify owner/private visibility with two separate user accounts.
4. Verify public collection reads and follow/unfollow behavior.
5. Verify private collections never appear on another profile.
6. Check mobile collection creator, color selection and book picker.
7. Merge only after the parent library/spine PR is merged or rebase onto its final main commit.

Until the migration is active, the profile renders a controlled preview/empty state rather than failing the profile page.
