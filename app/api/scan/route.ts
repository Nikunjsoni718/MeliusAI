import { NextRequest, NextResponse } from 'next/server';

import { generatePortfolioAssessment } from '@/lib/mentor';
import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sourceUrl?: string;
      description?: string;
      profession?: string;
      targetCompany?: string | null;
      autoApplyEnabled?: boolean;
    };

    if (!body.sourceUrl || !body.profession) {
      return NextResponse.json(
        { error: 'sourceUrl and profession are required.' },
        { status: 400 }
      );
    }

    const assessment = await generatePortfolioAssessment({
      sourceUrl: body.sourceUrl,
      profession: body.profession,
      targetCompany: body.targetCompany ?? null,
    });

    let savedProjectId: string | null = null;

    if (hasSupabaseServerEnv()) {
      try {
        const supabase = await createSupabaseServerClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

        if (sessionError) {
          throw sessionError;
        }

        if (sessionData.user) {
          const { data: project, error: projectError } = await supabase
            .from('projects')
            .insert({
              owner_id: sessionData.user.id,
              title: `${assessment.targetRole} verification scan`,
              file_url: body.sourceUrl,
              description: body.description?.trim() || null,
              source_kind: assessment.sourceKind,
              profession: body.profession,
              target_company: assessment.targetCompany,
              auto_apply_enabled: body.autoApplyEnabled ?? false,
              summary: assessment.summary,
              stack: [body.profession, assessment.sourceKind, assessment.targetRole],
              status: 'submitted',
            })
            .select('id')
            .single();

          if (projectError) {
            throw projectError;
          }

          savedProjectId = project.id;
        }
      } catch (error) {
        console.error('Failed to persist scan history', error);
      }
    }

    return NextResponse.json({ data: { ...assessment, savedProjectId } });
  } catch (error) {
    console.error('Failed to scan portfolio', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to scan portfolio.' },
      { status: 500 }
    );
  }
}
