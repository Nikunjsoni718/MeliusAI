import { expect, test } from '@playwright/test';

import { analyzeVaultProject, buildRepoAnalysisPrompt, calculateMeliusAuditScore, verifyMeliusAsset } from '../lib/mentor';

const productionLocation = 'app/api/users/route.ts: POST';
const productionScope = 'In API route: user provisioning';

function finding(
  findingId: string,
  text: string,
  severity: 'CRITICAL' | 'WARNING' | 'OPTIMIZATION',
  isCatastrophic = false
) {
  return { findingId, text, severity, scope: productionScope, location: productionLocation, isCatastrophic };
}

test('repository prompts require production proof and mechanical remediation', () => {
  const prompt = buildRepoAnalysisPrompt('https://github.com/acme/audit-target', {
    defaultBranch: 'main',
    files: [{ path: 'src/preview.tsx', content: 'element.innerHTML = searchTerm;' }],
  });

  expect(prompt).toContain('hard omit test files, mocks, dummy data, test fixtures, examples, and build-only code');
  expect(prompt).toContain('source variable/input, file path, and terminal sink');
  expect(prompt).toContain('one root-cause finding');
  expect(prompt).toContain('one short mechanical edit');
  expect(prompt).toContain('all four pillars');
  expect(prompt).toContain('Security (injections, traversal, broken access control');
  expect(prompt).toContain('Reliability and resilience');
  expect(prompt).toContain('Performance and optimization');
  expect(prompt).toContain('Code quality and maintainability');
  expect(prompt).toContain('five strongest verified architectural strengths');
  expect(prompt).toContain('five highest-priority unique findings');
  expect(prompt).toContain('"auditSummary"');
  expect(prompt).not.toContain('impactArea');
});

test('unique evidence profiles determine the proportional capped engineering assessment', () => {
  expect(calculateMeliusAuditScore([])).toBe(98);
  expect(calculateMeliusAuditScore([finding('F1', 'In cache layer: redundant cache refresh runs in app/api/users/route.ts.', 'OPTIMIZATION')])).toBe(97);
  expect(calculateMeliusAuditScore([finding('F1', 'In API route: request.body.email is passed to createUser without validation.', 'WARNING')])).toBe(93);
  expect(calculateMeliusAuditScore([finding('F1', 'In API route: request.body.userId reaches deleteAccount without an ownership branch.', 'CRITICAL')])).toBe(86);
  expect(
    calculateMeliusAuditScore([
      finding('F1', 'In API route: request.body.userId reaches deleteAccount without an ownership branch.', 'CRITICAL'),
      finding('F2', 'In write path: failed write promise is unhandled and discards persisted data.', 'CRITICAL'),
      finding('F3', 'Across API endpoints: unmanaged async work exhausts the worker pool.', 'CRITICAL'),
    ])
  ).toBe(62);
  expect(
    calculateMeliusAuditScore([
      finding('F1', 'Total system compromise: production accepts arbitrary administrator creation.', 'CRITICAL', true),
    ])
  ).toBe(24);
  expect(
    calculateMeliusAuditScore(
      Array.from({ length: 20 }, (_, index) =>
        finding(`W${index}`, `In API route: request.body.value is passed to handler ${index} without validation.`, 'WARNING')
      )
    )
  ).toBe(25);
});

test('invalid catastrophic flags cannot open the catastrophic score band', () => {
  const findings = Array.from({ length: 20 }, (_, index) =>
    finding(`C${index}`, `In API route: request.body.value is passed to handler ${index} without validation.`, 'CRITICAL', true)
  );

  expect(calculateMeliusAuditScore(findings)).toBe(25);
});

test('asset verification adapts canonical evidence telemetry to existing result fields', async () => {
  const providerPayload = {
    auditSummary: 'The production route has a verified request-validation gap while service ownership remains isolated.',
    strengths: ['In app/api/users/route.ts: the handler delegates persistence through one service boundary.'],
    findings: [finding('F1', 'In API route: request.body.email is passed to createUser without validation.', 'WARNING')],
    directives: [{ directiveId: 'D1', findingId: 'F1', text: 'Add userSchema.parse(request.body) before createUser in app/api/users/route.ts' }],
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerPayload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  const result = await verifyMeliusAsset({
    assetName: 'app/api/users/route.ts',
    content: 'export async function POST() {}',
    apiKey: 'test-key',
    fetchImpl,
  });

  expect(result.score).toBe(93);
  expect(result.findingImpacts.pros).toEqual([{ text: providerPayload.strengths[0] }]);
  expect(result.findingImpacts.cons).toEqual(providerPayload.findings);
  expect(result.findingImpacts.recommendations).toEqual(providerPayload.directives);
  expect(result.deltaSummary).toBe('Audit compiled from verified telemetry.');
});

test('vault analysis calculates its assessment after severity classification', async () => {
  const providerPayload = {
    auditSummary: 'The supplied route description establishes its API boundary and exposes one verified validation risk.',
    strengths: ['In app/api/users/route.ts: the stated service boundary is coherent with the supplied metadata.'],
    findings: [finding('F1', 'In API route: request.body.email is passed to createUser without validation.', 'WARNING')],
    directives: [{ directiveId: 'D1', findingId: 'F1', text: 'Add userSchema.parse(request.body) before createUser in app/api/users/route.ts' }],
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

test('test-only assets never reach the audit model or produce a finding', async () => {
  const fetchImpl = (async () => {
    throw new Error('The provider must not receive test-only content.');
  }) as typeof fetch;

  const result = await verifyMeliusAsset({
    assetName: 'src/users.test.ts',
    content: 'const password = "dummy-secret";',
    apiKey: 'test-key',
    fetchImpl,
  });

  expect(result.score).toBe(98);
  expect(result.weaknesses).toEqual([]);
  expect(result.recommendations).toEqual([]);
  expect(JSON.stringify(result)).not.toContain('dummy-secret');
});

test('asset verification rejects model scores and missing directives', async () => {
  const providerPayload = {
    auditSummary: 'A production validation branch is missing.',
    score: 100,
    strengths: ['In app/api/users/route.ts: the handler has one persistence boundary.'],
    findings: [finding('F1', 'In API route: request.body.email is passed to createUser without validation.', 'WARNING')],
    directives: [],
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerPayload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  await expect(
    verifyMeliusAsset({ assetName: 'app/api/users/route.ts', content: 'export async function POST() {}', apiKey: 'test-key', fetchImpl })
  ).rejects.toThrow('canonical audit telemetry contract');
});

test('asset verification collapses exact duplicate root causes and linked directives', async () => {
  const firstFinding = {
    findingId: 'F1',
    text: 'Across frontend: searchTerm is passed to dangerouslySetInnerHTML in app/preview.tsx.',
    severity: 'WARNING' as const,
    scope: 'Across frontend: preview rendering',
    location: 'app/preview.tsx: dangerouslySetInnerHTML',
    isCatastrophic: false,
  };
  const providerPayload = {
    auditSummary: 'The preview has one verified unsafe rendering path that needs a targeted change.',
    strengths: ['In app/preview.tsx: the preview rendering is isolated to one component.'],
    findings: [firstFinding, { ...firstFinding, findingId: 'F2', text: ` ${firstFinding.text} ` }],
    directives: [
      { directiveId: 'D1', findingId: 'F1', text: 'Replace dangerouslySetInnerHTML with a text node in app/preview.tsx' },
      { directiveId: 'D2', findingId: 'F2', text: 'Replace dangerouslySetInnerHTML with a text node in app/preview.tsx' },
    ],
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerPayload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  const result = await verifyMeliusAsset({
    assetName: 'app/preview.tsx',
    content: 'element.innerHTML = searchTerm;',
    apiKey: 'test-key',
    fetchImpl,
  });

  expect(result.findingImpacts.cons).toEqual([firstFinding]);
  expect(result.findingImpacts.recommendations).toEqual([providerPayload.directives[0]]);
  expect(result.score).toBe(93);
});

test('asset verification keeps five ranked findings with their linked directives', async () => {
  const providerPayload = {
    auditSummary: 'The supplied production code has verified authorization, validation, and cache-efficiency evidence across its service boundaries.',
    strengths: Array.from(
      { length: 6 },
      (_, index) => `In app/service${index}.ts: service ${index} maintains one verified ownership boundary.`
    ),
    findings: [
      {
        ...finding('F1', 'In cache layer: redundant refreshLoop performs duplicate work.', 'OPTIMIZATION'),
        scope: 'In cache layer: refresh scheduling',
        location: 'app/cache.ts: refreshLoop',
      },
      {
        ...finding('F2', 'In API route: request.body.token is passed to verifyToken without a missing-token branch.', 'WARNING'),
        scope: 'In API route: token validation',
        location: 'app/token.ts: verifyToken',
      },
      {
        ...finding('F3', 'In billing route: request.body.accountId is passed to chargeAccount without an ownership branch.', 'CRITICAL'),
        scope: 'In billing route: account authorization',
        location: 'app/billing.ts: chargeAccount',
      },
      {
        ...finding('F4', 'Across cache workers: redundant cache refresh runs after every request.', 'OPTIMIZATION'),
        scope: 'Across cache workers: refresh scheduling',
        location: 'app/cache-worker.ts: refreshCache',
      },
      {
        ...finding('F5', 'Across API endpoints: request.body.email is passed to createUser without validation.', 'WARNING'),
        scope: 'Across API endpoints: request validation',
        location: 'app/users.ts: createUser',
      },
      {
        ...finding('F6', 'Across API endpoints: request.body.userId is passed to deleteAccount without an ownership branch.', 'CRITICAL'),
        scope: 'Across API endpoints: account authorization',
        location: 'app/accounts.ts: deleteAccount',
      },
    ],
    directives: Array.from({ length: 6 }, (_, index) => ({
      directiveId: `D${index + 1}`,
      findingId: `F${index + 1}`,
      text: `Add guard${index + 1}(request.body) in app/finding${index + 1}.ts`,
    })),
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(providerPayload) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  const result = await verifyMeliusAsset({
    assetName: 'app/api/users/route.ts',
    content: 'export async function POST() {}',
    apiKey: 'test-key',
    fetchImpl,
  });

  expect(result.strengths).toHaveLength(5);
  expect(result.findingImpacts.cons.map((item) => item.findingId)).toEqual(['F6', 'F3', 'F5', 'F2', 'F4']);
  expect(result.findingImpacts.recommendations.map((item) => item.findingId).sort()).toEqual(['F2', 'F3', 'F4', 'F5', 'F6']);
  expect(result.findingImpacts.recommendations).toHaveLength(5);
  expect(result.score).toBe(63);
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
});
