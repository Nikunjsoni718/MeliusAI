import { NextResponse } from 'next/server';

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      service: 'meliusiq-backend',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed', error);
    return NextResponse.json({ error: 'Unable to read backend health.' }, { status: 500 });
  }
}
