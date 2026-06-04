# Analyze Repo Contract

## Input

- A single GitHub repository URL.

## Output

- `score`: integer between `1` and `100`.
- `tips`: exactly 3 strings.

## Rules

- Use Gemini `1.5 Flash`.
- Fetch a code snapshot from GitHub before asking Gemini to score the repo.
- Keep GitHub fetching, prompt construction, and response parsing in `/lib/mentor.ts`.
- Reject malformed URLs, API failures, and malformed model output instead of guessing.
- Keep tips concrete and implementation-oriented.
