import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const EXTRACTION_SYSTEM_PROMPT = `You are an ultra-precise extraction AI. Extract the core technical skills, explicit experience requirements, and key outcomes from the provided text.
CRITICAL RULES:
1. You must ONLY extract information explicitly written in the provided text.
2. DO NOT invent, assume, or hallucinate requirements (especially 'Years of Experience') if they are not specifically mentioned by the user.
3. Return ONLY a single comma-separated string of short tags. No quotes, no bullets.`;

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
