# Analyze Repo

## Purpose

`analyze-repo` turns a GitHub repository URL into a normalized score and exactly 3 improvement tips.

## Contract

- Input: GitHub repository URL.
- Output: `{ score: 1-100, tips: [tip, tip, tip] }`.
- Model: `gemini-1.5-flash`.

## Implementation Notes

- Fetch repository metadata and a curated code snapshot from GitHub before calling Gemini.
- Keep GitHub fetching, prompt construction, API calling, and response normalization in [`/lib/mentor.ts`](../../lib/mentor.ts).
- Prefer `GITHUB_TOKEN` or `GITHUB_ACCESS_TOKEN` when available to avoid rate-limit issues on larger repos.
- Reject malformed URLs and malformed model output.
- Do not invent extra tips or a fallback score.

## Environment

- `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` for Gemini access.
- `GITHUB_TOKEN` or `GITHUB_ACCESS_TOKEN` for higher GitHub API limits.
