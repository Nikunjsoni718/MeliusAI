import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const matchSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      matchScore: z.number().min(0).max(100),
      reasoning: z.string(),
    })
  ),
});

type CandidatePoolRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  skills: string[] | null;
};

function normalizeCandidate(row: CandidatePoolRow) {
  return {
    id: row.id,
    full_name: row.full_name ?? '',
    username: row.username ?? '',
    bio: row.bio ?? '',
    skills: Array.isArray(row.skills) ? row.skills : [],
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { requirement?: unknown };
    const requirement = typeof body.requirement === 'string' ? body.requirement.trim() : '';

    if (!requirement) {
      return NextResponse.json(
        { detail: 'Please add new information to bring clarity.' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data: candidateRows, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, bio, skills');

    if (error) {
      console.warn('Semantic talent match candidate fetch failed:', error.message);
      return NextResponse.json([], { status: 200 });
    }

    const candidates = (candidateRows ?? []).map((row) => normalizeCandidate(row as CandidatePoolRow));

    if (candidates.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    const { object } = await generateObject({
      model: openai('gpt-4o'),
      schema: matchSchema,
      system:
        'You are MeliusAI semantic talent matching infrastructure. Read recruiter requirements and candidate profile data, then score contextual fit. Understand synonyms and adjacent capability signals: video editing can match video creator, video production, Premiere Pro, After Effects, reels, or content editing; python can match backend automation, FastAPI, data scripting, AI pipelines, or infrastructure tooling. Score only candidates that have evidence in their bio or skills. Return concise reasoning tied to the requirement.',
      prompt: `Recruiter requirement:
${requirement}

Candidate profiles JSON:
${JSON.stringify(candidates)}

Return the best semantic matches by exact candidate id. Use 0-100 matchScore values.`,
    });

    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const mergedMatches = object.matches
      .filter((match) => match.matchScore >= 40)
      .map((match) => {
        const candidate = candidateById.get(match.id);

        if (!candidate) {
          return null;
        }

        return {
          ...candidate,
          matchScore: match.matchScore,
          match_index: match.matchScore,
          composite_match_index: match.matchScore / 100,
          vector_match: match.matchScore / 100,
          aiReasoning: match.reasoning,
          reasoning: match.reasoning,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((left, right) => right.matchScore - left.matchScore);

    return NextResponse.json(mergedMatches, { status: 200 });
  } catch (error) {
    console.error('Semantic GPT-4o talent matching route failed:', error);

    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : 'Semantic matching engine failed to process this requirement.',
      },
      { status: 500 }
    );
  }
}
