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

test('preserves internal catastrophe metadata and collapses exact normalized duplicates', () => {
  expect(
    normalizeAuditFindings([
      {
        findingId: 'F1',
        text: 'Across frontend: searchTerm reaches dangerouslySetInnerHTML in preview.tsx.',
        severity: 'CRITICAL',
        isCatastrophic: true,
      },
      {
        findingId: 'F2',
        text: '  across frontend: searchTerm reaches dangerouslySetInnerHTML in preview.tsx.  ',
        severity: 'CRITICAL',
        isCatastrophic: true,
      },
    ])
  ).toEqual([
    {
      findingId: 'F1',
      text: 'Across frontend: searchTerm reaches dangerouslySetInnerHTML in preview.tsx.',
      severity: 'CRITICAL',
      isCatastrophic: true,
    },
  ]);
});

test('keeps internal severity metadata while removing leaked display labels', () => {
  expect(
    normalizeAuditFindings([
      { findingId: 'F1', text: '[CRITICAL] Input reaches renderHtml in preview.tsx.', severity: 'CRITICAL' },
      { findingId: 'F2', text: 'WARNING: Return clearInterval(timer) from usePolling.', severity: 'WARNING' },
    ])
  ).toEqual([
    { findingId: 'F1', text: 'Input reaches renderHtml in preview.tsx.', severity: 'CRITICAL' },
    { findingId: 'F2', text: 'Return clearInterval(timer) from usePolling.', severity: 'WARNING' },
  ]);
});
