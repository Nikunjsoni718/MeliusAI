import { expect, test } from '@playwright/test';

import { normalizeAuditFindings } from '../lib/audit-report-normalizer';

test('normalizes finding impact scores from camel-case and snake-case JSONB payloads', () => {
  expect(
    normalizeAuditFindings([
      { text: 'Typed API boundaries prevent invalid requests.', impactScore: 15 },
      { text: 'Session expiry has no user-facing recovery path.', impact_score: -8 },
      { text: 'No score is present for this historical finding.' },
    ])
  ).toEqual([
    { text: 'Typed API boundaries prevent invalid requests.', impactScore: 15 },
    { text: 'Session expiry has no user-facing recovery path.', impactScore: -8 },
    { text: 'No score is present for this historical finding.' },
  ]);
});
