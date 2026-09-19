import { expect, test } from '@playwright/test';

import { analyzeVaultProject, buildRepoAnalysisPrompt, calculateMeliusAuditScore, verifyMeliusAsset } from '../lib/mentor';

test('repository prompts require production proof and mechanical remediation', () => {
  const prompt = buildRepoAnalysisPrompt('https://github.com/acme/audit-target', {
    defaultBranch: 'main',
    files: [{ path: 'src/preview.tsx', content: 'element.innerHTML = searchTerm;' }],
  });

  expect(prompt).toContain('omit harmless test fixtures, mocks, dummy data, examples, and build-only scripts');
  expect(prompt).toContain('source variable or input, sink function or API, and file');
  expect(prompt).toContain('one root-cause finding');
  expect(prompt).toContain('jargon-free mechanical code edit');
});

test('unique evidence profiles determine the proportional capped engineering assessment', () => {
  expect(calculateMeliusAuditScore([])).toBe(98);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Cache Tune: Cache invalidation can be simplified.', severity: 'OPTIMIZATION', isCatastrophic: false },
    ])
  ).toBe(97);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Input Gap: Request body is unvalidated.', severity: 'WARNING', isCatastrophic: false },
    ])
  ).toBe(93);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Auth Bypass: Ownership is never checked.', severity: 'CRITICAL', isCatastrophic: false },
    ])
  ).toBe(86);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Auth Bypass: Ownership is never checked.', severity: 'CRITICAL', isCatastrophic: false },
      { findingId: 'F2', text: 'Data Loss: Failed writes are silently discarded.', severity: 'CRITICAL', isCatastrophic: false },
      { findingId: 'F3', text: 'Outage Risk: Requests exhaust the worker pool.', severity: 'CRITICAL', isCatastrophic: false },
    ])
  ).toBe(62);
  expect(
    calculateMeliusAuditScore([
      { findingId: 'F1', text: 'Full Compromise: Production accepts arbitrary administrator creation.', severity: 'CRITICAL', isCatastrophic: true },
    ])
  ).toBe(24);
  expect(
    calculateMeliusAuditScore(
      Array.from({ length: 20 }, (_, index) => ({
        findingId: `W${index}`,
        text: `Warning ${index}: Production boundary needs proof.`,
        severity: 'WARNING' as const,
        isCatastrophic: false,
      }))
    )
  ).toBe(25);
});

test('asset verification returns evidence-based findings and engineering directives', async () => {
  const providerPayload = {
    ai_summary: 'The artifact has one validation gap and clear service boundaries.',
    delta_summary: 'The current audit found a request-validation gap.',
    strengths: [{ text: 'Passed Boundary: Service ownership remains isolated.' }],
    weaknesses: [{ findingId: 'F1', text: 'Input Gap: Request body is unvalidated.', severity: 'WARNING', isCatastrophic: false }],
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

  expect(result.score).toBe(93);
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
    findings: [{ findingId: 'F1', text: 'Validation Gap: External input remains unconstrained.', severity: 'WARNING', isCatastrophic: false }],
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

  expect(result.logicScore).toBe(93);
  expect(result.audit.findings).toEqual(providerPayload.findings);
  expect(result.audit.directives).toEqual(providerPayload.directives);
  expect(result.audit.findingImpacts.cons).toEqual(providerPayload.findings);
});

test('metadata-only fallback does not create unproven findings or deductions', async () => {
  const result = await analyzeVaultProject({
    fileName: 'portfolio.pdf',
    fileType: 'application/pdf',
    description: 'A short description without source or runtime material.',
  });

  expect(result.source).toBe('simulated');
  expect(result.logicScore).toBe(98);
  expect(result.audit.findings).toEqual([]);
  expect(result.audit.directives).toEqual([]);
  expect(result.audit.findingImpacts.cons).toEqual([]);
  expect(result.audit.findingImpacts.recommendations).toEqual([]);
});

test('asset verification rejects a model-generated score', async () => {
  const providerPayload = {
    ai_summary: 'The artifact has one validation gap.',
    delta_summary: 'The current audit found a request-validation gap.',
    score: 100,
    strengths: [{ text: 'Passed Boundary: Service ownership remains isolated.' }],
    weaknesses: [{ findingId: 'F1', text: 'Input Gap: Request body is unvalidated.', severity: 'WARNING', isCatastrophic: false }],
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

test('asset verification collapses exact duplicate root causes and linked directives', async () => {
  const providerPayload = {
    ai_summary: 'The route exposes one verified rendering path that needs a targeted change.',
    delta_summary: 'The current audit confirmed the same unsafe rendering path twice.',
    strengths: [{ text: 'Clear Route: Preview rendering remains isolated.' }],
    weaknesses: [
      { findingId: 'F1', text: 'Across frontend: searchTerm reaches dangerouslySetInnerHTML in preview.tsx.', severity: 'WARNING', isCatastrophic: false },
      { findingId: 'F2', text: ' across frontend: searchTerm reaches dangerouslySetInnerHTML in preview.tsx. ', severity: 'WARNING', isCatastrophic: false },
    ],
    recommendations: [
      { findingId: 'F1', text: 'Render searchTerm through the text node in preview.tsx.', impactArea: 'security' },
      { findingId: 'F2', text: 'Replace dangerouslySetInnerHTML in preview.tsx.', impactArea: 'security' },
    ],
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerPayload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  const result = await verifyMeliusAsset({
    assetName: 'preview.tsx',
    content: 'element.innerHTML = searchTerm;',
    apiKey: 'test-key',
    fetchImpl,
  });

  expect(result.findingImpacts.cons).toEqual([providerPayload.weaknesses[0]]);
  expect(result.findingImpacts.recommendations).toEqual([
    providerPayload.recommendations[0],
  ]);
  expect(result.score).toBe(93);
});
