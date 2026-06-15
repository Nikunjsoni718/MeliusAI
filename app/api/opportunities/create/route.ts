import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type CreateOpportunityPayload = {
  candidate_profile_id?: unknown;
  company_name?: unknown;
  role_title?: unknown;
  match_score?: unknown;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateOpportunityPayload;
    const candidateProfileId =
      typeof payload.candidate_profile_id === 'string' ? payload.candidate_profile_id.trim() : '';
    const companyName = typeof payload.company_name === 'string' ? payload.company_name.trim() : '';
    const roleTitle = typeof payload.role_title === 'string' ? payload.role_title.trim() : '';
    const matchScore = typeof payload.match_score === 'number' ? Math.round(payload.match_score) : null;

    if (!candidateProfileId || !companyName || !roleTitle) {
      return NextResponse.json(
        { error: 'Missing candidate profile, company name, or role title.' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        company_name: companyName,
        role_title: roleTitle,
        status: 'invited',
      })
      .select('id, company_name, role_title, status, created_at')
      .single();

    if (jobError) {
      throw jobError;
    }

    const invitationStatus = matchScore === null ? 'invited' : `invited:${matchScore}`;
    const { error: applicationError } = await supabase.from('user_applications').insert({
      user_id: candidateProfileId,
      job_id: job.id,
      status: invitationStatus,
    });

    if (applicationError) {
      throw applicationError;
    }

    return NextResponse.json(
      {
        success: true,
        job,
        candidate_profile_id: candidateProfileId,
        match_score: matchScore,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Opportunity invitation creation failed:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to create opportunity invitation.',
      },
      { status: 500 }
    );
  }
}
