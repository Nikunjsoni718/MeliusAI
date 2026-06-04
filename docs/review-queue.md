# Review Queue

Approve or adjust these initial architecture decisions before we move from scaffold to implementation:

1. Product experience: recruiter-facing landing page at `/` and student-facing dashboard at `/dashboard`.
2. Auth and data model: `users`, `projects`, and `scores` stay as the first-pass public schema, with `talent` and `recruiter` roles provisioned from Supabase auth metadata.
3. Project ownership: talents create and manage their own `projects`, while recruiters create `scores`.
4. Scoring contract: `analyze-repo` returns exactly one `1-100` score and exactly `3` actionable tips.
5. AI boundary: repository scoring logic stays isolated in `/lib/mentor.ts`.
6. GitHub intake: the first pass analyzes a curated GitHub code snapshot rather than cloning full repositories server-side.
7. Recruiter visibility: recruiters can read talent profiles and project submissions, but recruiter profiles remain private by default.
