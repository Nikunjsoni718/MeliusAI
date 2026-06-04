# Review Queue

Approve or adjust these architecture decisions before we expand the backend:

- Confirm the profile table name stays `users` instead of switching to `profiles`.
- Confirm talents own `projects` records and recruiters only score them.
- Confirm the first pass should allow recruiters to read talent profiles while still hiding recruiter profiles.
- Confirm the GitHub URL check should remain strict for standard `github.com/org/repo` links.
- Confirm score rows should allow multiple review passes per project instead of enforcing a single latest score.
