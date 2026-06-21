import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const HR_KEYWORD_SYSTEM_PROMPT =
  "You are an advanced HR semantic parsing layer engine for MeliusAI. Analyze the raw text biography of this user. Extract every single industry skill, tool, programming language, and core professional capability mentioned. Return ONLY a valid, raw JSON array of lowercase string keywords. Do not include any introductory sentences, conversational text, or markdown code blocks. Example Output: ['video editing', 'python', 'ui ux design', 'premiere pro'].";

const BIO_EXTRACTION_SYSTEM_PROMPT =
  "You are an expert technical recruiter. Analyze the following candidate biography. Extract specific technical experiences (years, tools, roles) and work preferences (remote, hybrid, startup, enterprise, etc.). Return ONLY a valid JSON object with two keys: 'experience' (a list of strings) and 'preferences' (a list of strings). Do not return markdown, just raw JSON.";

type ProfileUpdatePayload = {
  bio?: unknown;
  skills?: unknown;
};

type ExtractedBioData = {
  experience: string[];
  preferences: string[];
};

function normalizeKeywordArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueKeywords = new Set<string>();

  for (const item of value) {
    const keyword = String(item).trim().toLowerCase();

    if (keyword) {
      uniqueKeywords.add(keyword);
    }
  }

  return Array.from(uniqueKeywords);
}

function parseKeywordJson(rawText: string): string[] {
  const cleanText = rawText
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return normalizeKeywordArray(JSON.parse(cleanText));
  } catch {
    const singleQuoteNormalized = cleanText.replace(/'/g, '"');

    try {
      return normalizeKeywordArray(JSON.parse(singleQuoteNormalized));
    } catch {
      return [];
    }
  }
}

async function extractInternalKeywords(bio: string) {
  const cleanBio = bio.trim();

  if (!cleanBio) {
    return [];
  }

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: HR_KEYWORD_SYSTEM_PROMPT,
      prompt: cleanBio,
      temperature: 0,
    });

    return parseKeywordJson(text);
  } catch (error) {
    console.warn('Profile semantic keyword extraction failed quietly:', error);
    return [];
  }
}

function parseExtractedBioJson(rawText: string): ExtractedBioData {
  const cleanText = rawText
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanText) as Record<string, unknown>;

    return {
      experience: normalizeKeywordArray(parsed.experience),
      preferences: normalizeKeywordArray(parsed.preferences),
    };
  } catch {
    return { experience: [], preferences: [] };
  }
}

async function extract_bio_data(bio_text: string): Promise<ExtractedBioData> {
  const cleanBio = bio_text.trim();

  if (!cleanBio) {
    return { experience: [], preferences: [] };
  }

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: BIO_EXTRACTION_SYSTEM_PROMPT,
      prompt: cleanBio,
      temperature: 0,
    });

    return parseExtractedBioJson(text);
  } catch (error) {
    console.warn('Profile bio attribute extraction failed quietly:', error);
    return { experience: [], preferences: [] };
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ProfileUpdatePayload;
    const bio = typeof payload.bio === 'string' ? payload.bio.trim() : '';
    const skills = normalizeKeywordArray(payload.skills);
    const [aiKeywords, extractedBioData] = await Promise.all([
      extractInternalKeywords(bio),
      extract_bio_data(bio),
    ]);
    const internalKeywords = normalizeKeywordArray([...aiKeywords, ...skills]);

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized profile update request.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        bio,
        skills,
        internal_keywords: internalKeywords,
        extracted_experience: extractedBioData.experience,
        extracted_preferences: extractedBioData.preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('id, bio, skills, internal_keywords, extracted_experience, extracted_preferences')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        profile: data,
        internal_keywords: internalKeywords,
        extracted_experience: extractedBioData.experience,
        extracted_preferences: extractedBioData.preferences,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Profile update semantic ingestion failed:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Profile update failed.',
      },
      { status: 500 }
    );
  }
}
