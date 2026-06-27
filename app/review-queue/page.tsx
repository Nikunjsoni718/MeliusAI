import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const reviewItems = [
  {
    title: "Product experience",
    description:
      "Keep the recruiter-facing landing page at / and the student-facing workspace at /home.",
  },
  {
    title: "Auth and data model",
    description:
      "Use users, projects, and scores as the first-pass schema, with talent and recruiter roles provisioned from Supabase auth metadata.",
  },
  {
    title: "Project ownership",
    description:
      "Talents create and manage projects, while recruiters create scores on those projects.",
  },
  {
    title: "Scoring contract",
    description:
      "Return exactly one 1-100 score and exactly 3 actionable tips for each analyzed repository.",
  },
  {
    title: "AI boundary",
    description:
      "Keep repository scoring logic isolated in /lib/mentor.ts, including GitHub snapshotting and Gemini normalization.",
  },
  {
    title: "GitHub intake",
    description:
      "Analyze a curated GitHub code snapshot in the first pass instead of cloning full repositories server-side.",
  },
  {
    title: "Recruiter visibility",
    description:
      "Allow recruiters to view talent profiles and submissions, while keeping recruiter profiles private by default.",
  },
];

export default function ReviewQueuePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="accent">Review Queue</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Approve the initial MeliusAI architecture.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
              This queue captures the cross-thread decisions from UI/UX,
              backend, and AI scoring so we can lock the foundation before
              building deeper product flows.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" href="/">
              Back to landing
            </Button>
            <Button href="/home">Open dashboard</Button>
          </div>
        </div>

        <div className="grid gap-4">
          {reviewItems.map((item, index) => (
            <Card key={item.title}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="mono flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/10 text-sm font-semibold text-sky-300">
                    {index + 1}
                  </div>
                  <div>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription className="mt-1 text-base leading-7">
                      {item.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="border-sky-500/20">
          <CardHeader>
            <CardTitle>Approval target</CardTitle>
            <CardDescription className="text-base leading-7">
              Once these decisions are approved, the next pass can wire real
              Supabase env vars, add auth screens, and connect the repository
              scorer to the dashboard flow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-slate-400">
              The same items are also captured in
              <span className="mono"> docs/review-queue.md</span> for a
              filesystem review.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
