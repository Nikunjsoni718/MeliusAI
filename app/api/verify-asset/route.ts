import { openai } from '@ai-sdk/openai';
import type { User } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const auditReportSchema = z.object({
  calculatedScore: z.number().min(0).max(100),
  executiveSummary: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  strategicRecommendations: z.array(z.string()),
});

type AuditReport = z.infer<typeof auditReportSchema>;

type VerifyAssetPayload = {
  projectId?: unknown;
  assetName?: unknown;
  assetTextContent?: unknown;
  userContextDescription?: unknown;
};

const AUTHORIZED_REVIEWER_ROLES = new Set(['admin', 'reviewer', 'recruiter']);

function getUserMetadataRoles(user: User) {
  const roleValues = [
    user.app_metadata?.role,
    user.user_metadata?.role,
    user.app_metadata?.roles,
    user.user_metadata?.roles,
  ].flatMap((value) => (Array.isArray(value) ? value : [value]));

  return roleValues
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildReportMarkdown(assetName: string, report: AuditReport) {
  const pros = report.pros.map((item) => `- ${item}`).join('\n');
  const cons = report.cons.map((item) => `- ${item}`).join('\n');
  const recommendations = report.strategicRecommendations.map((item) => `- ${item}`).join('\n');

  return `## Executive Summary
${report.executiveSummary}

## Pros
${pros || '- No explicit strengths were identified from the submitted content.'}

## Cons
${cons || '- No explicit risks were identified from the submitted content.'}

## Strategic Recommendations
${recommendations || '- Keep expanding the project context and validation evidence.'}

## Scorecard
Asset: ${assetName || 'Project Asset'}

MeliusAI Verification Score: **${report.calculatedScore}/100**`;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userProfile, error: userProfileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (userProfileError) {
      throw new Error(`Unable to resolve reviewer authorization: ${userProfileError.message}`);
    }

    const authorizedRoles = [
      ...getUserMetadataRoles(user),
      typeof userProfile?.role === 'string' ? userProfile.role.toLowerCase() : '',
    ];

    if (!authorizedRoles.some((role) => AUTHORIZED_REVIEWER_ROLES.has(role))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as VerifyAssetPayload;
    const projectId = getString(body.projectId);
    const assetName = getString(body.assetName) || 'Project Asset';
    const assetTextContent = getString(body.assetTextContent);
    const userContextDescription = getString(body.userContextDescription);

    if (!projectId || !assetTextContent) {
      return NextResponse.json(
        { error: 'projectId and assetTextContent are required.' },
        { status: 400 }
      );
    }

    const { object: auditReport } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: auditReportSchema,
      system:
        'You are MeliusAI, a production-grade multimodal asset verification engine. Thoroughly audit the submitted asset text against the user-provided intent and context. Calculate an objective score out of 100 based on correctness, completeness, technical clarity, implementation quality, and alignment with the stated criteria. Return only structured data that satisfies the schema. The executiveSummary must be clean Markdown text detailing performance. The pros, cons, and strategicRecommendations arrays must contain specific, actionable observations.',
      prompt: `Asset name:
${assetName}

User context / audit criteria:
${userContextDescription || 'No explicit user criteria were provided. Infer reasonable verification criteria from the asset content.'}

Asset text content:
${assetTextContent}`,
    });

    const reportText = buildReportMarkdown(assetName, auditReport);
    const updatePayload = {
      score: auditReport.calculatedScore,
      audit_summary: auditReport.executiveSummary,
      pros: auditReport.pros,
      cons: auditReport.cons,
      recommendations: auditReport.strategicRecommendations,
      user_description: userContextDescription,
      status: 'Verified',
      evaluation_score: auditReport.calculatedScore,
      logic_score: auditReport.calculatedScore,
      has_been_audited: true,
      ai_summary: reportText,
      description: reportText,
    };

    const { data: updatedProject, error: updateError } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId)
      .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`)
      .select('*')
      .single();

    if (updateError?.code === 'PGRST116') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (updateError) {
      throw new Error(`Supabase project audit persistence failed: ${updateError.message}`);
    }

    return NextResponse.json({
      success: true,
      report: auditReport,
      project: updatedProject,
      reportText,
      score: auditReport.calculatedScore,
    });
  } catch (error) {
    console.error('Serverless asset verification failed:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to verify asset.' },
      { status: 500 }
    );
  }
}
