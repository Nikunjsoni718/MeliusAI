import { expect, test } from '@playwright/test';

import { normalizeAuditFindings } from '../lib/audit-report-normalizer';

test('maps legacy numeric finding impacts to non-numeric severity labels', () => {
  expect(
    normalizeAuditFindings([
      { text: 'Typed API boundaries prevent invalid requests.', impactScore: 15 },
      { text: 'Session expiry has no user-facing recovery path.', impact_score: -8 },
      { text: 'Credentials are committed to source control.', impactScore: -18 },
      { text: 'No score is present for this historical finding.' },
    ])
  ).toEqual([
    { text: 'Typed API boundaries prevent invalid requests.' },
    { text: 'Session expiry has no user-facing recovery path.', severity: 'WARNING' },
    { text: 'Credentials are committed to source control.', severity: 'CRITICAL' },
    { text: 'No score is present for this historical finding.' },
  ]);
});

test('normalizes new finding and directive metadata while retaining legacy links', () => {
  expect(
    normalizeAuditFindings([
      { text: 'Secure Session: Cookie flags are configured.' },
      { text: 'Input Gap: Request body is unvalidated.', deduction_id: 'D1', impact_score: -5 },
      { text: 'Validate Input: Parse the request body.', deductionId: 'D1' },
      { text: 'Secure Route: Ownership is checked.', findingId: 'F2', severity: 'OPTIMIZATION' },
    ])
  ).toEqual([
    { text: 'Secure Session: Cookie flags are configured.' },
    { text: 'Input Gap: Request body is unvalidated.', findingId: 'D1', severity: 'OPTIMIZATION' },
    { text: 'Validate Input: Parse the request body.', findingId: 'D1' },
    { text: 'Secure Route: Ownership is checked.', findingId: 'F2', severity: 'OPTIMIZATION' },
  ]);
});
