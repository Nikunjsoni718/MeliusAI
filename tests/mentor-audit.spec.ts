import { expect, test } from '@playwright/test';

import { calculateMeliusAuditScore, verifyMeliusAsset } from '../lib/mentor';

test('Lighthouse audit math starts at 100 and honors the 15-point floor', () => {
  expect(calculateMeliusAuditScore([])).toBe(100);
  expect(
    calculateMeliusAuditScore([
      { deductionId: 'D1', text: 'Input Gap: Validation is missing.', impactScore: -12 },
    ])
  ).toBe(88);
  expect(
    calculateMeliusAuditScore([
      { deductionId: 'D1', text: 'Critical One: First severe risk.', impactScore: -20 },
      { deductionId: 'D2', text: 'Critical Two: Second severe risk.', impactScore: -20 },
      { deductionId: 'D3', text: 'Critical Three: Third severe risk.', impactScore: -20 },
      { deductionId: 'D4', text: 'Critical Four: Fourth severe risk.', impactScore: -20 },
      { deductionId: 'D5', text: 'Critical Five: Fifth severe risk.', impactScore: -20 },
    ])
  ).toBe(15);
});

test('asset verification returns qualitative highlights and linked recovery steps', async () => {
  const providerPayload = {
    ai_summary: 'The artifact has one validation gap and clear service boundaries.',
    delta_summary: 'The current audit found a request-validation gap.',
    strengths: [{ text: 'Passed Boundary: Service ownership remains isolated.' }],
    weaknesses: [{ deductionId: 'D1', text: 'Input Gap: Request body is unvalidated.', impactScore: -5 }],
    recommendations: [{ deductionId: 'D1', text: 'Validate Input: Parse the request body.' }],
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerPayload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  const result = await verifyMeliusAsset({
    assetName: 'route.ts',
    content: 'export async function POST() {}',
    apiKey: 'test-key',
    fetchImpl,
  });

  expect(result.score).toBe(95);
  expect(result.findingImpacts.pros).toEqual(providerPayload.strengths);
  expect(result.findingImpacts.cons).toEqual(providerPayload.weaknesses);
  expect(result.findingImpacts.recommendations).toEqual(providerPayload.recommendations);
});
