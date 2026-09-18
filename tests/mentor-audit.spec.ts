import { expect, test } from '@playwright/test';

import { analyzeVaultProject, calculateMeliusAuditScore, verifyMeliusAsset } from '../lib/mentor';

test('severity profiles determine the capped engineering assessment', () => {
  expect(calculateMeliusAuditScore([])).toBe(98);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Cache Tune: Cache invalidation can be simplified.', severity: 'OPTIMIZATION' },
    ])
  ).toBe(98);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Input Gap: Request body is unvalidated.', severity: 'WARNING' },
    ])
  ).toBe(84);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Auth Bypass: Ownership is never checked.', severity: 'CRITICAL' },
    ])
  ).toBe(55);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Auth Bypass: Ownership is never checked.', severity: 'CRITICAL' },
      { findingId: 'F2', text: 'Data Loss: Failed writes are silently discarded.', severity: 'CRITICAL' },
      { findingId: 'F3', text: 'Outage Risk: Requests exhaust the worker pool.', severity: 'CRITICAL' },
    ])
  ).toBe(15);
});

test('asset verification returns evidence-based findings and engineering directives', async () => {
  const providerPayload = {
    ai_summary: 'The artifact has one validation gap and clear service boundaries.',
    delta_summary: 'The current audit found a request-validation gap.',
    strengths: [{ text: 'Passed Boundary: Service ownership remains isolated.' }],
    weaknesses: [{ findingId: 'F1', text: 'Input Gap: Request body is unvalidated.', severity: 'WARNING' }],
    recommendations: [{ findingId: 'F1', text: 'Validate Input: Parse the request body.', impactArea: 'security' }],
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

  expect(result.score).toBe(84);
  expect(result.findingImpacts.pros).toEqual(providerPayload.strengths);
  expect(result.findingImpacts.cons).toEqual(providerPayload.weaknesses);
  expect(result.findingImpacts.recommendations).toEqual(providerPayload.recommendations);
});

test('vault analysis calculates its assessment after severity classification', async () => {
  const providerPayload = {
    conceptualAlignment: 'The supplied project description matches the available artifact metadata.',
    architecturalLogic: 'The stated architecture is coherent within the limited supplied evidence.',
    summary: 'The evidence supports the stated design, with one material validation risk. The report prioritizes that verified risk for remediation.',
    strengths: ['Clear Scope: The asset metadata matches the documented project intent.', 'Architecture Signal: The description identifies the primary system boundary.'],
    findings: [{ findingId: 'F1', text: 'Validation Gap: External input remains unconstrained.', severity: 'WARNING' }],
    directives: [{ findingId: 'F1', text: 'Validate Input: Enforce schema validation at the boundary.', impactArea: 'security' }],
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerPayload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  const result = await analyzeVaultProject({
    fileName: 'route.ts',
    fileType: 'text/typescript',
    description: 'A typed API route that accepts external request data.',
    apiKey: 'test-key',
    fetchImpl,
  });

  expect(result.logicScore).toBe(84);
  expect(result.audit.findings).toEqual(providerPayload.findings);
  expect(result.audit.directives).toEqual(providerPayload.directives);
  expect(result.audit.findingImpacts.cons).toEqual(providerPayload.findings);
});

test('asset verification rejects a model-generated score', async () => {
  const providerPayload = {
    ai_summary: 'The artifact has one validation gap.',
    delta_summary: 'The current audit found a request-validation gap.',
    score: 100,
    strengths: [{ text: 'Passed Boundary: Service ownership remains isolated.' }],
    weaknesses: [{ findingId: 'F1', text: 'Input Gap: Request body is unvalidated.', severity: 'WARNING' }],
    recommendations: [{ findingId: 'F1', text: 'Validate Input: Parse the request body.', impactArea: 'security' }],
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerPayload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  await expect(
    verifyMeliusAsset({
      assetName: 'route.ts',
      content: 'export async function POST() {}',
      apiKey: 'test-key',
      fetchImpl,
    })
  ).rejects.toThrow('must not include a model-generated score');
});
