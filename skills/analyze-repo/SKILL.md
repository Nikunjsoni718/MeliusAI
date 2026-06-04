---
name: analyze-repo
description: Analyze a GitHub repository with Gemini 1.5 Flash and return a single 1-100 score plus exactly 3 actionable improvement tips. Use when asked to review, score, benchmark, or summarize a codebase from a GitHub URL.
---

# Analyze Repo

## Overview

Use this skill to turn a GitHub repository URL into a concise quality score and three concrete next steps.

## Workflow

1. Validate that the input is a GitHub repository URL.
2. Fetch a lightweight repository snapshot from GitHub before scoring so Gemini sees real code and project structure.
3. Delegate prompt building, GitHub snapshotting, Gemini calling, and response normalization to `/lib/mentor.ts`.
4. Return only the normalized score and exactly 3 actionable tips.
5. If the model output is malformed, fail clearly rather than inventing a score or extra tips.

## Output Contract

- Score must be an integer from `1` to `100`.
- Tips must be exactly `3` strings.
- Tips should be specific, actionable, and tied to the repository structure or code quality.

## Notes

- Use Gemini `1.5 Flash`.
- Prefer a GitHub token when available to reduce rate-limit risk while fetching repository files.
- Keep mentor logic isolated in `/lib/mentor.ts`.
- Do not add narrative filler around the result unless the user asks for it.
