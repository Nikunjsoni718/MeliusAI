# Backend Scaffold

## Data Model

- `public.users` stores one profile per authenticated Supabase user.
- `public.projects` stores the GitHub repo submitted by a talent.
- `public.scores` stores one or more reviewer or AI scoring passes per project.

## Auth Roles

- `talent` signs up, gets a profile row through the `auth.users` trigger, and can create or edit their own projects.
- `recruiter` signs up with the recruiter role in user metadata and can read talent projects and create scores.

## API Surface

- `GET /api/health` for service checks.
- `GET|PATCH /api/auth/profile` for the current authenticated user's profile.
- `GET|POST /api/projects` for project listing and submission.
- `GET|PATCH|DELETE /api/projects/[id]` for project detail management.
- `GET|POST /api/scores` for score retrieval and creation.

## Notes

- The migration uses row-level security and a trigger to mirror `auth.users` into `public.users`.
- GitHub URLs are validated at the database layer, so bad repo links fail before they reach the dashboard.
- Role changes are intentionally not exposed through the profile route; they should only happen through signup metadata or an admin flow.
