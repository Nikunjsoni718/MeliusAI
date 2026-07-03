import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('MeliusAI Full Platform Lifecycle', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  test('Talent signup route: clear copy and clickable fields', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/talent/signup', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Create your free MeliusAI Talent account.' }).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Upload a project and get an AI review with score, strengths, weaknesses, and recommendations.').first()).toBeVisible();

    const fullName = page.getByLabel('Full Name');
    await fullName.click();
    await expect(fullName).toBeFocused();
    await fullName.fill('LinkedIn Tester');

    await page.getByLabel('Username').fill('linkedin_tester');
    await page.getByLabel('Birth Date').fill('1999-01-01');
    await page.getByLabel('Email').fill('linkedin.tester@example.com');
    await page.getByLabel('Password').fill('TalentPassword123!');
    await expect(page.getByRole('button', { name: 'Create Account' }).last()).toBeEnabled();
  });

  test('Talent signup route: mobile fast-tap keeps inputs interactive', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:3000/auth/talent/signup', { waitUntil: 'domcontentloaded' });

    const email = page.getByLabel('Email');
    await email.click();
    await email.click();
    await email.fill('fast.tap@example.com');

    await expect(email).toBeFocused();
    await expect(email).toHaveValue('fast.tap@example.com');
  });

  // ==========================================
  // TRACK 1: INDIVIDUAL / TALENT LIFECYCLE
  // ==========================================
  test('Individual Flow: Login and Upload Real Project', async ({ page }) => {
    // 1. Navigate to the existing Individual Login page
    await page.goto('http://localhost:3000/auth/login');
    await expect(page).toHaveURL('http://localhost:3000/auth/login');

    // 3. Complete individual authentication form
    await page.fill('input[type="email"]', 'talent_user@gmail.com');
    await page.fill('input[type="password"]', 'TalentPassword123!');
    await page.locator('button', { hasText: /^Sign In$/ }).last().click();

    // 4. Verify successful redirection to the Talent Dashboard
    await expect(page).toHaveURL('http://localhost:3000/dashboard');

    // 5. Navigate to the upload section
    await page.click('text=Upload'); // Change this text to match your actual nav button

    // 6. Upload the specific test-hhw.pdf file from the root folder
    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, '../test-hhw.pdf'));

    // 7. Click the submit/analyze button
    await page.click('button:has-text("Verify with MeliusAI")'); // Update to your exact upload button text

    // 8. ⏳ WAIT FOR THE AI (20-second timeout)
    // We wait for a specific UI element to appear that proves the AI finished.
    const aiRatingContainer = page.locator('text=Verified'); // Change 'Rating' to a word your UI uses when finished
    await expect(aiRatingContainer).toBeVisible({ timeout: 20000 }); 

    // 9. Verify the score actually populated somewhere on the screen
    await expect(page.locator('body')).toContainText('Score:'); 
  });

  // ==========================================
  // TRACK 2: VERIFIED ORGANISATION LIFECYCLE
  // ==========================================
  test('Organisation Flow: Login and Execute AI Talent Search', async ({ page }) => {
    // 1. Navigate to the main auth portal selector
    await page.goto('http://localhost:3000/auth');

    // 2. Navigate to the Verified Organisation Portal using the strict link selector
    await page.locator('a[href="/auth/organization"]').click();
    await expect(page).toHaveURL('http://localhost:3000/auth/organization');

    // 3. Complete Corporate Authentication
    await page.fill('input[type="email"]', 'hr@meliusai.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.locator('button', { hasText: /^Sign In$/ }).last().click();

    // 4. Verify landing on the corporate workspace dashboard
    await expect(page).toHaveURL('http://localhost:3000/dashboard/organization');

    // 5. Interact with the AI Talent Audit / Search engine
    const aiSearchInput = page.locator('input[placeholder*="Search talent"], input[type="search"]');
    await aiSearchInput.fill('Next.js developer with experience building database architectures');

    // 6. Execute the AI query
    await page.keyboard.press('Enter');

    // 7. Account for AI API latency (10 seconds)
    const resultsContainer = page.locator('.talent-results-grid, text=Matching Candidates');
    await expect(resultsContainer).toBeVisible({ timeout: 10000 });

    // 8. Verify the search engine returned relevant profile data
    await expect(page.locator('body')).toContainText('Match Score');
  });

});
