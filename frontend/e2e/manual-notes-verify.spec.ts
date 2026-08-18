import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';
const SCREENSHOTS = './e2e/screenshots/verify';

const doLogin = async (page: import('@playwright/test').Page) => {
  await page.goto(`${BASE}/login`);
  const devBtn = page.getByRole('button', { name: /continue as developer/i });
  const loginBtn = page.getByRole('button', { name: /log in/i });
  const btn = (await devBtn.isVisible({ timeout: 3000 }).catch(() => false))
    ? devBtn
    : loginBtn;
  await btn.click();
  await page.waitForURL('**/workspaces**', { timeout: 10000 });
};

test.beforeEach(async ({ page }) => {
  await doLogin(page);
});

test.describe('Manual Notes Verification', () => {
  test('Note 1: Create Workspace — no character limit or DNS-1123 validation', async ({ page }) => {
    await page.goto(`${BASE}/workspaces`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create workspace/i }).click();
    await page.waitForTimeout(500);

    const nameInput = page.getByTestId('workspace-name-input');
    const submitBtn = page.getByTestId('create-workspace-submit');

    // Test 1a: UPPERCASE — should be rejected by DNS-1123 but isn't
    await nameInput.fill('UPPERCASE-NAME');
    await page.screenshot({ path: `${SCREENSHOTS}/v1a-uppercase.png`, fullPage: true });
    const isEnabledUppercase = await submitBtn.isEnabled();
    console.log(`UPPERCASE: submit enabled = ${isEnabledUppercase}`);

    // Test 1b: spaces — should be rejected
    await nameInput.fill('name with spaces');
    await page.screenshot({ path: `${SCREENSHOTS}/v1b-spaces.png`, fullPage: true });
    const isEnabledSpaces = await submitBtn.isEnabled();
    console.log(`SPACES: submit enabled = ${isEnabledSpaces}`);

    // Test 1c: special chars — should be rejected
    await nameInput.fill('name!@#$%^&*()');
    await page.screenshot({ path: `${SCREENSHOTS}/v1c-special-chars.png`, fullPage: true });
    const isEnabledSpecial = await submitBtn.isEnabled();
    console.log(`SPECIAL CHARS: submit enabled = ${isEnabledSpecial}`);

    // Test 1d: very long name (100+ chars) — DNS-1123 max is 63
    const longName = 'a'.repeat(100);
    await nameInput.fill(longName);
    await page.screenshot({ path: `${SCREENSHOTS}/v1d-long-name.png`, fullPage: true });
    const isEnabledLong = await submitBtn.isEnabled();
    console.log(`100-CHAR NAME: submit enabled = ${isEnabledLong}`);

    // Test 1e: valid DNS-1123 name — should work
    await nameInput.fill('valid-workspace-name');
    const isEnabledValid = await submitBtn.isEnabled();
    console.log(`VALID NAME: submit enabled = ${isEnabledValid}`);

    // All invalid names should have been rejected client-side but aren't
    expect(isEnabledUppercase).toBe(true);  // BUG: should be false
    expect(isEnabledSpaces).toBe(true);     // BUG: should be false
    expect(isEnabledSpecial).toBe(true);    // BUG: should be false
    expect(isEnabledLong).toBe(true);       // BUG: should be false
    expect(isEnabledValid).toBe(true);      // Correct: should be true

    // Try submitting an invalid name and capture the server error
    await nameInput.fill('INVALID_NAME!!!');
    await submitBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOTS}/v1e-server-error.png`, fullPage: true });

    // Close modal
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('Note 2: Provider credential error message wording', async ({ page }) => {
    // Navigate to any workspace's providers page
    await page.goto(`${BASE}/workspaces`);
    await page.waitForLoadState('networkidle');

    // Click the first workspace link
    const firstWorkspace = page.locator('a[href*="/workspaces/"]').first();
    if (await firstWorkspace.isVisible({ timeout: 3000 }).catch(() => false)) {
      const href = await firstWorkspace.getAttribute('href');
      const wsName = href?.split('/workspaces/')[1]?.split('/')[0] ?? 'default';

      await page.goto(`${BASE}/workspaces/${wsName}/providers`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Click add provider
      const addBtn = page.getByRole('button', { name: /add provider/i });
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(500);

        // Fill name but skip credentials
        const nameInput = page.getByTestId('provider-name-input');
        await nameInput.fill('test-provider-no-creds');

        // Select a provider type if dropdown is available
        const typeSelect = page.getByTestId('provider-type-select');
        if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
          const options = await typeSelect.locator('option:not([disabled])').allTextContents();
          if (options.length > 0) {
            await typeSelect.selectOption({ index: 1 });
            await page.waitForTimeout(500);
          }
        }

        // Try to submit (may or may not be enabled depending on required creds)
        const submitBtn = page.getByTestId('create-provider-submit');
        if (await submitBtn.isEnabled()) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
        }

        await page.screenshot({ path: `${SCREENSHOTS}/v2-provider-error.png`, fullPage: true });
      } else {
        console.log('Add provider button not visible — skipping');
        await page.screenshot({ path: `${SCREENSHOTS}/v2-no-add-button.png`, fullPage: true });
      }
    } else {
      console.log('No workspaces found — skipping provider test');
      await page.screenshot({ path: `${SCREENSHOTS}/v2-no-workspaces.png`, fullPage: true });
    }
  });

  test('Note 3: Stale tabs — cross-tab data freshness', async ({ browser }) => {
    test.setTimeout(60000);
    // Open two separate browser contexts (simulates two tabs)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const tabA = await contextA.newPage();
    const tabB = await contextB.newPage();

    // Login in both
    for (const tab of [tabA, tabB]) {
      await doLogin(tab);
    }

    // Both tabs: navigate to workspace list
    await tabA.goto(`${BASE}/workspaces`);
    await tabB.goto(`${BASE}/workspaces`);
    await tabA.waitForLoadState('networkidle');
    await tabB.waitForLoadState('networkidle');

    // Screenshot both tabs showing initial state
    await tabA.screenshot({ path: `${SCREENSHOTS}/v3a-tab-a-before.png`, fullPage: true });
    await tabB.screenshot({ path: `${SCREENSHOTS}/v3b-tab-b-before.png`, fullPage: true });

    // Tab A: get the current workspace count text
    const countTextBefore = await tabB.locator('body').textContent();
    console.log(`Tab B text before: ${countTextBefore?.substring(0, 200)}`);

    // Tab A: create a workspace
    await tabA.getByRole('button', { name: /create workspace/i }).click();
    await tabA.waitForTimeout(500);
    const nameInput = tabA.getByTestId('workspace-name-input');
    await nameInput.fill('stale-tab-test');
    await tabA.getByTestId('create-workspace-submit').click();
    await tabA.waitForTimeout(3000);

    // Screenshot Tab A after creation
    await tabA.screenshot({ path: `${SCREENSHOTS}/v3c-tab-a-after-create.png`, fullPage: true });

    // Tab B: does NOT auto-refresh — check if it still shows old data
    // Simulate "switching to tab B" — just take screenshot without refreshing
    await tabB.screenshot({ path: `${SCREENSHOTS}/v3d-tab-b-stale.png`, fullPage: true });
    const countTextAfter = await tabB.locator('body').textContent();
    console.log(`Tab B text after (no refresh): ${countTextAfter?.substring(0, 200)}`);

    // Clean up: delete the test workspace via Tab A
    // (we'll leave this for manual cleanup since delete may vary)

    await contextA.close();
    await contextB.close();
  });

  test('Note 4: Logs scroll — check if log viewer renders with many lines', async ({ page }) => {
    await page.goto(`${BASE}/workspaces`);
    await page.waitForLoadState('networkidle');

    // Find a workspace and sandbox with logs
    const firstWorkspace = page.locator('a[href*="/workspaces/"]').first();
    if (await firstWorkspace.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstWorkspace.click();
      await page.waitForLoadState('networkidle');

      // Look for a sandbox link
      const sandboxLink = page.locator('a[href*="/sandboxes/"]').first();
      if (await sandboxLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sandboxLink.click();
        await page.waitForLoadState('networkidle');

        // Click Logs tab
        const logsTab = page.getByRole('tab', { name: /logs/i });
        if (await logsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await logsTab.click();
          await page.waitForTimeout(2000);

          // Screenshot at default line count
          await page.screenshot({ path: `${SCREENSHOTS}/v4a-logs-default.png`, fullPage: true });

          // Change to 2000 lines
          const linesSelect = page.getByTestId('logs-lines-select');
          if (await linesSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
            await linesSelect.selectOption('2000');
            await page.waitForTimeout(3000);
            await page.screenshot({ path: `${SCREENSHOTS}/v4b-logs-2000.png`, fullPage: true });
          }
        }
      } else {
        console.log('No sandboxes found — skipping logs test');
        await page.screenshot({ path: `${SCREENSHOTS}/v4-no-sandboxes.png`, fullPage: true });
      }
    }
  });

  test('Note 5: Terminal input persistence across tab switch', async ({ page }) => {
    await page.goto(`${BASE}/workspaces`);
    await page.waitForLoadState('networkidle');

    const firstWorkspace = page.locator('a[href*="/workspaces/"]').first();
    if (await firstWorkspace.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstWorkspace.click();
      await page.waitForLoadState('networkidle');

      const sandboxLink = page.locator('a[href*="/sandboxes/"]').first();
      if (await sandboxLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sandboxLink.click();
        await page.waitForLoadState('networkidle');

        // Click Terminal tab
        const termTab = page.getByRole('tab', { name: /terminal/i });
        if (await termTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await termTab.click();
          await page.waitForTimeout(3000);

          // Screenshot: terminal connected
          await page.screenshot({ path: `${SCREENSHOTS}/v5a-terminal-connected.png`, fullPage: true });

          // Check if connected text appears
          const connectedText = page.getByText('Connected');
          const isConnected = await connectedText.isVisible({ timeout: 5000 }).catch(() => false);
          console.log(`Terminal connected: ${isConnected}`);

          // Switch to Logs tab
          const logsTab = page.getByRole('tab', { name: /logs/i });
          if (await logsTab.isVisible()) {
            await logsTab.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: `${SCREENSHOTS}/v5b-switched-to-logs.png`, fullPage: true });
          }

          // Switch back to Terminal — should reconnect (losing previous session)
          await termTab.click();
          await page.waitForTimeout(3000);
          await page.screenshot({ path: `${SCREENSHOTS}/v5c-terminal-reconnected.png`, fullPage: true });

          const reconnectedText = page.getByText('Connected');
          const isReconnected = await reconnectedText.isVisible({ timeout: 5000 }).catch(() => false);
          console.log(`Terminal reconnected (fresh session): ${isReconnected}`);
        }
      } else {
        console.log('No sandboxes — skipping terminal test');
        await page.screenshot({ path: `${SCREENSHOTS}/v5-no-sandboxes.png`, fullPage: true });
      }
    }
  });

  test('Note 6: Admin vs user — check what dev mode exposes', async ({ page }) => {
    await page.goto(`${BASE}/workspaces`);
    await page.waitForLoadState('networkidle');

    // Check user dropdown for role info
    const userDropdown = page.getByText(/development user/i);
    if (await userDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
      await userDropdown.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SCREENSHOTS}/v6a-user-dropdown.png`, fullPage: true });
      // Close dropdown
      await page.keyboard.press('Escape');
    }

    // Check if admin-only navigation is visible
    const settingsLink = page.getByRole('link', { name: /settings/i });
    const settingsVisible = await settingsLink.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Settings (admin-only) visible: ${settingsVisible}`);

    // Try to access the auth config endpoint to see roles
    const authResponse = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/auth/config');
        return { status: res.status, body: await res.json() };
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log(`Auth config: ${JSON.stringify(authResponse)}`);

    const userResponse = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/auth/user');
        return { status: res.status, body: await res.json() };
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log(`User info: ${JSON.stringify(userResponse)}`);

    await page.screenshot({ path: `${SCREENSHOTS}/v6b-admin-pages.png`, fullPage: true });

    // Navigate to settings page (admin-only)
    await page.goto(`${BASE}/settings`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOTS}/v6c-settings-page.png`, fullPage: true });
  });
});
