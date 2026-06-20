import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const EXTRACTION_SYSTEM_PROMPT =
  'You are an expert technical recruiter AI. Extract the core technical skills, required experience levels, and key outcomes from the provided job description. Return ONLY a single comma-separated string of short, punchy tags. Do not use quotes, bullet points, or extra text. Example output: TypeScript, UI/UX Design, 3+ Years Experience, Wireframing, Figma';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { text?: unknown };
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: 'A job description is required.' }, { status: 400 });
    }

    const { text: generatedText } = await generateText({
      model: openai('gpt-4o-mini'),
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: text,
      temperature: 0,
    });

    const tags = generatedText
      .replace(/^```(?:text)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .replace(/[\r\n]+/g, ' ')
      .trim();

    if (!tags) {
      return NextResponse.json({ error: 'The extraction model returned no tags.' }, { status: 502 });
    }

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Opportunity keyword extraction failed:', error);
    return NextResponse.json({ error: 'Unable to extract job keywords right now.' }, { status: 500 });
  }
}
