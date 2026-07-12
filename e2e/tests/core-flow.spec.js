import { test, expect } from '@playwright/test';

test('complete core decision-vault flow', async ({ page }) => {
  // Step 1: Navigating to landing page
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Step 2: Clicking login button to go to login screen
  const loginButton = page.locator('button.loginButton').first();
  await expect(loginButton).toBeVisible();
  await loginButton.click();

  // Step 3: Entering credentials & submitting
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  
  await emailInput.fill('demo@decisionvault.dev');
  await passwordInput.fill('Password123');
  
  const submitButton = page.locator('button[type="submit"]');
  await expect(submitButton).toBeVisible();
  await submitButton.click();

  // Step 4: Verify navigation to dashboard
  const dashboardTab = page.locator('button:has-text("Dashboard")');
  await expect(dashboardTab).toBeVisible({ timeout: 10000 });

  // Step 5: Navigate to College Discovery
  const discoveryTab = page.locator('button:has-text("College Discovery")');
  await expect(discoveryTab).toBeVisible();
  await discoveryTab.click();
  await page.waitForSelector('#search');

  // Step 6: Search for Motilal Nehru National Institute of Technology (MNNIT)
  const searchInput = page.locator('input[placeholder="Search college, branch, state, or tag"]');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('MNNIT');
  await page.waitForTimeout(500); // Wait for list filter

  // Step 7: Add to shortlist (should show iconAction button since MNNIT is filtered)
  const shortlistBtn = page.locator('button.iconAction').first();
  await expect(shortlistBtn).toBeVisible();
  await shortlistBtn.click();
  await page.waitForTimeout(500);

  // Step 8: Navigate to College Vault & AI Insights
  const vaultTab = page.locator('button:has-text("College Vault & AI")');
  await expect(vaultTab).toBeVisible();
  await vaultTab.click();
  await page.waitForSelector('#vault');

  // Step 9: Select MNNIT from dropdown and add a research note
  const collegeSelect = page.locator('#vault select').first();
  await expect(collegeSelect).toBeVisible();
  await collegeSelect.selectOption({ label: 'Motilal Nehru National Institute of Technology' });
  await page.waitForTimeout(500);

  const noteTextarea = page.locator('textarea[placeholder="Write a personal research note..."]');
  await expect(noteTextarea).toBeVisible();
  await noteTextarea.fill('This is a verified test note added by Playwright E2E test runner.');
  
  const saveNoteBtn = page.locator('button:has-text("Save Note")');
  await expect(saveNoteBtn).toBeVisible();
  await saveNoteBtn.click();
  
  // Verify note was successfully appended to UI
  await expect(page.locator('text=This is a verified test note added by Playwright E2E test runner.')).toBeVisible();

  // Step 10: Navigate to What-If Simulation and check priority matrix
  const matrixTab = page.locator('button:has-text("What-If Simulation")');
  await expect(matrixTab).toBeVisible();
  await matrixTab.click();
  await page.waitForSelector('#matrix');

  // Step 11: Navigate to Confirm & Reflect
  const reflectionTab = page.locator('button:has-text("Confirm & Reflect")');
  await expect(reflectionTab).toBeVisible();
  await reflectionTab.click();
  await page.waitForTimeout(500);

  // Step 12: Select MNNIT and Lock Seat decision
  const decisionSelect = page.locator('.panelHeader select').first();
  await expect(decisionSelect).toBeVisible();
  await decisionSelect.selectOption({ label: 'MNNIT' });

  // Click confirm decision button if not already locked
  const confirmBtn = page.locator('button:has-text("Confirm College Decision")');
  const isConfirmBtnVisible = await confirmBtn.isVisible();
  if (isConfirmBtnVisible) {
    await confirmBtn.click();
  }

  // Step 13: Retrospective reflection loop inputs
  const satisfactionInput = page.locator('input[type="range"]');
  await satisfactionInput.waitFor({ state: 'visible', timeout: 5000 });
  await satisfactionInput.fill('9');
  
  const accuracyCheckbox = page.locator('input[type="checkbox"]').first();
  await accuracyCheckbox.check();

  await page.locator('input[placeholder="e.g. Coding culture was even better..."]').fill('The coding culture is outstanding.');
  await page.locator('input[placeholder="e.g. Hostel rooms are small..."]').fill('Hostel rooms are slightly small.');

  const submitReflectionBtn = page.locator('button:has-text("Submit 6-Month Reflection")');
  await expect(submitReflectionBtn).toBeVisible();
  await submitReflectionBtn.click();

  // Verify reflection is successfully logged in UI
  await expect(page.locator('text=Reflection Logged successfully!').first()).toBeVisible({ timeout: 5000 });
});
