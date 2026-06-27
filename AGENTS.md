# MeliusAI Project Rules
## Tech Stack
- Frontend: Next.js 16 (App Router), Tailwind CSS
- Backend/DB: Supabase (Auth, PostgreSQL)
- AI Processing: Gemini 1.5 Flash (via API)
- Payments: Razorpay (India Standard)

## Design System
- Theme: Dark Mode Premium (Slate-950 background)
- Accent Color: Electric Blue (#0070f3)
- Typography: Inter for UI, Geist Mono for code scores

## Workflow Agreements
- Always run `npm run dev` to verify UI changes.
- Use `shadcn/ui` for all components.
- Every API route must have error handling.
- AI Mentor logic must be isolated in `/lib/mentor.ts`.