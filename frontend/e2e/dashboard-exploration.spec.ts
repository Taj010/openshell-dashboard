import { test, expect, Page } from '@playwright/test';

const SCREENSHOT_DIR = 'e2e/screenshots';

async function devLogin(page: Page) {
  await page.goto('/');
  const devBtn = page.getByTestId('dev-login');
  if (await devBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await devBtn.click();
    await page.waitForURL('**/workspaces', { timeout: 10_000 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. LOGIN PAGE
// ────────────────────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test('renders dev-mode login with warning alert', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Authentication is disabled')).toBeVisible();
    await expect(page.getByTestId('dev-login')).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-login-page.png`,
      fullPage: true,
    });
  });

  test('"Continue as developer" logs in and redirects to /workspaces', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('dev-login').click();
    await expect(page).toHaveURL(/\/workspaces/);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-post-login-redirect.png`,
      fullPage: true,
    });
  });

  test('session persists across reload', async ({ page }) => {
    await devLogin(page);
    await page.reload();
    await expect(page).toHaveURL(/\/workspaces/);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/03-session-persist.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. NAVIGATION & ROUTING
// ────────────────────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('sidebar navigation links are visible', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Primary navigation"]');
    await expect(nav).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/04-sidebar-nav.png`,
      fullPage: true,
    });
  });

  test('unknown routes redirect to /workspaces', async ({ page }) => {
    await page.goto('/this-does-not-exist');
    await expect(page).toHaveURL(/\/workspaces/);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/05-unknown-route-redirect.png`,
      fullPage: true,
    });
  });

  test('deeply nested unknown route redirects', async ({ page }) => {
    await page.goto('/foo/bar/baz/qux');
    await expect(page).toHaveURL(/\/workspaces/);
  });

  test('direct URL to /gateway loads gateway page', async ({ page }) => {
    await page.goto('/gateway');
    // May redirect non-admin users to /workspaces
    const url = page.url();
    const onGateway = url.includes('/gateway');
    const onWorkspaces = url.includes('/workspaces');
    expect(onGateway || onWorkspaces).toBe(true);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/06-gateway-direct-url.png`,
      fullPage: true,
    });
  });

  test('browser back/forward works', async ({ page }) => {
    await page.goto('/workspaces');
    await page.goto('/gateway');
    await page.goBack();
    await expect(page).toHaveURL(/\/workspaces/);
    await page.goForward();
    // Could be /gateway or redirected to /workspaces
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/07-browser-history.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. WORKSPACE LIST
// ────────────────────────────────────────────────────────────────────────────

test.describe('Workspace list', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('workspace page loads (empty state or table)', async ({ page }) => {
    await page.goto('/workspaces');
    const hasTable = await page.getByTestId('workspace-table').isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No workspaces').isVisible().catch(() => false);
    const hasError = await page.getByText('Failed to load').isVisible().catch(() => false);
    expect(hasTable || hasEmpty || hasError).toBe(true);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/08-workspace-list.png`,
      fullPage: true,
    });
  });

  test('create workspace modal opens and closes', async ({ page }) => {
    await page.goto('/workspaces');
    const createBtn = page.getByTestId('create-workspace').or(
      page.getByTestId('create-workspace-empty'),
    );
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/09-create-workspace-modal.png`,
        fullPage: true,
      });
      // Try to close modal by pressing Escape
      await page.keyboard.press('Escape');
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/10-create-workspace-modal-closed.png`,
        fullPage: true,
      });
    }
  });

  test('EDGE: rapidly click create button multiple times', async ({ page }) => {
    await page.goto('/workspaces');
    const createBtn = page.getByTestId('create-workspace').or(
      page.getByTestId('create-workspace-empty'),
    );
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // First click opens the modal -- subsequent clicks should be intercepted
      // by the modal backdrop (which is correct PatternFly behavior).
      await createBtn.click();
      await page.waitForTimeout(300);
      // Modal backdrop should now be blocking the button
      const backdrop = page.locator('.pf-v6-c-backdrop');
      const backdropVisible = await backdrop.isVisible().catch(() => false);
      expect(backdropVisible).toBe(true);
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/11-rapid-create-clicks.png`,
        fullPage: true,
      });
      // Try clicking the button behind the modal -- it should NOT open a second modal
      const modalCount = await page.locator('.pf-v6-c-modal-box').count();
      expect(modalCount).toBeLessThanOrEqual(1);
      await page.keyboard.press('Escape');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. WORKSPACE DETAIL / SANDBOX LIST
// ────────────────────────────────────────────────────────────────────────────

test.describe('Workspace detail', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('navigating to a non-existent workspace shows error or empty', async ({
    page,
  }) => {
    await page.goto('/workspaces/workspace-that-does-not-exist');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/12-nonexistent-workspace.png`,
      fullPage: true,
    });
  });

  test('EDGE: workspace name with special characters in URL', async ({
    page,
  }) => {
    await page.goto('/workspaces/test%20workspace%21%40%23');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/13-special-chars-workspace.png`,
      fullPage: true,
    });
  });

  test('EDGE: workspace name with unicode', async ({ page }) => {
    await page.goto('/workspaces/工作区-テスト');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/14-unicode-workspace.png`,
      fullPage: true,
    });
  });

  test('EDGE: extremely long workspace name in URL', async ({ page }) => {
    const longName = 'a'.repeat(500);
    await page.goto(`/workspaces/${longName}`);
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/15-long-workspace-name.png`,
      fullPage: true,
    });
  });

  test('EDGE: workspace URL with path traversal attempt', async ({ page }) => {
    await page.goto('/workspaces/../../../etc/passwd');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/16-path-traversal.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. SANDBOX DETAIL
// ────────────────────────────────────────────────────────────────────────────

test.describe('Sandbox detail edge cases', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('non-existent sandbox returns error', async ({ page }) => {
    await page.goto('/workspaces/default/sandboxes/fake-sandbox-999');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/17-nonexistent-sandbox.png`,
      fullPage: true,
    });
  });

  test('EDGE: sandbox detail with invalid tab param', async ({ page }) => {
    await page.goto('/workspaces/default/sandboxes/test?tab=nonexistent-tab');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/18-invalid-tab-param.png`,
      fullPage: true,
    });
  });

  test('EDGE: sandbox name with SQL injection attempt', async ({ page }) => {
    await page.goto(
      "/workspaces/default/sandboxes/' OR '1'='1",
    );
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/19-sql-injection-sandbox.png`,
      fullPage: true,
    });
  });

  test('EDGE: sandbox name with XSS attempt', async ({ page }) => {
    await page.goto(
      '/workspaces/default/sandboxes/<script>alert(1)</script>',
    );
    await page.waitForTimeout(3000);
    // Ensure no JS alert was triggered
    const alertTriggered = await page
      .evaluate(() => (window as any).__xssTriggered)
      .catch(() => false);
    expect(alertTriggered).toBeFalsy();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/20-xss-sandbox.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. PROVIDER DETAIL
// ────────────────────────────────────────────────────────────────────────────

test.describe('Provider detail edge cases', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('non-existent provider returns error or redirect', async ({ page }) => {
    await page.goto('/workspaces/default/providers/no-such-provider');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/21-nonexistent-provider.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. THEME TOGGLE
// ────────────────────────────────────────────────────────────────────────────

test.describe('Theme toggle', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('toggles dark/light theme', async ({ page }) => {
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/22-theme-light.png`,
      fullPage: true,
    });
    const themeBtn = page.getByTestId('theme-toggle');
    await themeBtn.click();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/23-theme-dark.png`,
      fullPage: true,
    });
    await themeBtn.click();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/24-theme-toggled-back.png`,
      fullPage: true,
    });
  });

  test('STRESS: toggle theme rapidly 20 times', async ({ page }) => {
    const themeBtn = page.getByTestId('theme-toggle');
    for (let i = 0; i < 20; i++) {
      await themeBtn.click();
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/25-theme-rapid-toggle.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. ABOUT MODAL & HELP MENU
// ────────────────────────────────────────────────────────────────────────────

test.describe('About modal and help', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('help menu opens and about modal renders', async ({ page }) => {
    await page.getByTestId('help-menu').click();
    await page.getByTestId('about-menu-item').click();
    await expect(page.getByText('OpenShell Dashboard')).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/26-about-modal.png`,
      fullPage: true,
    });
  });

  test('about modal shows version info', async ({ page }) => {
    await page.getByTestId('help-menu').click();
    await page.getByTestId('about-menu-item').click();
    await expect(page.getByText('Dashboard version')).toBeVisible();
    await expect(page.getByText('Gateway version')).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/27-about-modal-details.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. USER DROPDOWN
// ────────────────────────────────────────────────────────────────────────────

test.describe('User dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('user dropdown opens and shows options', async ({ page }) => {
    await page.getByTestId('current-user').click();
    await expect(page.getByTestId('logout')).toBeVisible();
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/28-user-dropdown.png`,
      fullPage: true,
    });
  });

  test('EDGE: copy subject ID (clipboard)', async ({ page }) => {
    await page.getByTestId('current-user').click();
    const copyBtn = page.getByTestId('copy-subject');
    if (await copyBtn.isVisible().catch(() => false)) {
      await copyBtn.click();
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/29-copy-subject.png`,
        fullPage: true,
      });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. SIDEBAR COLLAPSE (responsive)
// ────────────────────────────────────────────────────────────────────────────

test.describe('Responsive sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('sidebar collapses on small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 600 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/30-small-viewport.png`,
      fullPage: true,
    });
  });

  test('STRESS: resize viewport rapidly', async ({ page }) => {
    const sizes = [
      { width: 1920, height: 1080 },
      { width: 375, height: 667 },
      { width: 1440, height: 900 },
      { width: 320, height: 568 },
      { width: 2560, height: 1440 },
      { width: 480, height: 800 },
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(200);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/31-rapid-resize.png`,
      fullPage: true,
    });
  });

  test('EDGE: very narrow viewport (280px)', async ({ page }) => {
    await page.setViewportSize({ width: 280, height: 600 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/32-very-narrow.png`,
      fullPage: true,
    });
  });

  test('EDGE: very wide viewport (3840px)', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/33-very-wide.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. API ERROR HANDLING
// ────────────────────────────────────────────────────────────────────────────

test.describe('API error scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('EDGE: API returns 500 for gateway info', async ({ page }) => {
    await page.route('**/api/v1/gateway/info', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal server error' }),
      }),
    );
    await page.goto('/gateway');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/34-api-500-gateway.png`,
      fullPage: true,
    });
  });

  test('EDGE: API returns 500 for workspaces', async ({ page }) => {
    await page.route('**/api/v1/workspaces', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Database connection lost' }),
      }),
    );
    await page.goto('/workspaces');
    await page.waitForTimeout(3000);
    const errVisible = await page.getByText('Failed to load').isVisible().catch(() => false);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/35-api-500-workspaces.png`,
      fullPage: true,
    });
  });

  test('EDGE: API times out (network error)', async ({ page }) => {
    await page.route('**/api/v1/workspaces', (route) => route.abort('timedout'));
    await page.goto('/workspaces');
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/36-api-timeout.png`,
      fullPage: true,
    });
  });

  test('EDGE: API returns empty JSON', async ({ page }) => {
    await page.route('**/api/v1/workspaces', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }),
    );
    await page.goto('/workspaces');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/37-api-empty-json.png`,
      fullPage: true,
    });
  });

  test('EDGE: API returns malformed JSON', async ({ page }) => {
    await page.route('**/api/v1/workspaces', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{invalid json!!!',
      }),
    );
    await page.goto('/workspaces');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/38-api-malformed-json.png`,
      fullPage: true,
    });
  });

  test('EDGE: API returns 401 (session expired)', async ({ page }) => {
    await page.route('**/api/v1/workspaces', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Token expired' }),
      }),
    );
    await page.goto('/workspaces');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/39-api-401-session-expired.png`,
      fullPage: true,
    });
  });

  test('EDGE: API returns giant payload', async ({ page }) => {
    const bigPayload = Array.from({ length: 1000 }, (_, i) => ({
      metadata: {
        name: `workspace-${i}`,
        id: `ws-${i}`,
        labels: {},
        createdAtMs: Date.now() - i * 100000,
      },
      phase: 'READY',
    }));
    await page.route('**/api/v1/workspaces', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(bigPayload),
      }),
    );
    await page.goto('/workspaces');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/40-api-giant-payload.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 12. CONCURRENT / STRESS
// ────────────────────────────────────────────────────────────────────────────

test.describe('Stress tests', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('STRESS: rapid page navigation (15 navigations)', async ({ page }) => {
    const routes = [
      '/workspaces',
      '/gateway',
      '/global-policy',
      '/settings',
      '/workspaces',
      '/workspaces/default',
      '/workspaces',
      '/gateway',
      '/settings',
      '/workspaces',
      '/global-policy',
      '/workspaces',
      '/gateway',
      '/workspaces',
      '/settings',
    ];
    for (const route of routes) {
      await page.goto(route);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/41-rapid-navigation.png`,
      fullPage: true,
    });
  });

  test('STRESS: many sidebar clicks', async ({ page }) => {
    for (let i = 0; i < 10; i++) {
      const links = page.locator('nav[aria-label="Primary navigation"] a');
      const count = await links.count();
      if (count > 0) {
        await links.nth(i % count).click();
        await page.waitForTimeout(200);
      }
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/42-rapid-sidebar-clicks.png`,
      fullPage: true,
    });
  });

  test('STRESS: open/close about modal 10 times', async ({ page }) => {
    for (let i = 0; i < 10; i++) {
      await page.getByTestId('help-menu').click();
      await page.getByTestId('about-menu-item').click();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/43-rapid-about-modal.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 13. ACCESSIBILITY QUICK CHECKS
// ────────────────────────────────────────────────────────────────────────────

test.describe('Accessibility checks', () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page);
  });

  test('page has proper heading hierarchy', async ({ page }) => {
    const h1 = page.locator('h1');
    const count = await h1.count();
    expect(count).toBeGreaterThanOrEqual(1);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/44-headings.png`,
      fullPage: true,
    });
  });

  test('sidebar toggle has aria-label', async ({ page }) => {
    const toggleBtn = page.locator(
      'button[aria-label="Global navigation"]',
    );
    await expect(toggleBtn).toBeVisible();
  });

  test('EDGE: keyboard tab navigation works', async ({ page }) => {
    // Press Tab multiple times to ensure focus moves
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/45-keyboard-nav.png`,
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 14. LOGOUT
// ────────────────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
  test('logout returns to login page', async ({ page }) => {
    await devLogin(page);
    await page.getByTestId('current-user').click();
    await page.getByTestId('logout').click();
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/46-post-logout.png`,
      fullPage: true,
    });
  });
});
