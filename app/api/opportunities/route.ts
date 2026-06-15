import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type CandidateApplicationRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  job_id: string;
  jobs?: {
    id: string;
    company_name: string | null;
    role_title: string | null;
    location: string | null;
    status: string | null;
    created_at: string | null;
  } | null;
};

function extractMatchScore(status: string | null) {
  if (!status?.startsWith('invited:')) {
    return null;
  }

  const score = Number(status.split(':')[1]);
  return Number.isFinite(score) ? Math.round(score) : null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get('candidateId')?.trim();

    if (!candidateId) {
      return NextResponse.json({ error: 'Missing candidateId query parameter.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('user_applications')
      .select('id, status, created_at, job_id, jobs(id, company_name, role_title, location, status, created_at)')
      .eq('user_id', candidateId)
      .or('status.eq.invited,status.like.invited:%')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const opportunities = ((data ?? []) as CandidateApplicationRow[])
      .map((application) => {
        const job = application.jobs;

        if (!job) {
          return null;
        }

        return {
          id: application.id,
          job_id: application.job_id,
          recruiter_name: job.company_name ?? 'Recruiter Workspace',
          role_title: job.role_title ?? 'Matched Opportunity',
          location: job.location,
          status: application.status,
          match_score: extractMatchScore(application.status),
          created_at: application.created_at ?? job.created_at,
        };
      })
      .filter((opportunity): opportunity is NonNullable<typeof opportunity> => Boolean(opportunity));

    return NextResponse.json({ roles: opportunities }, { status: 200 });
  } catch (error) {
    console.error('Candidate opportunities lookup failed:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load candidate opportunities.',
      },
      { status: 500 }
    );
  }
}
