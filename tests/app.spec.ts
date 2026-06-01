import { test, expect, Page } from "@playwright/test";
import { execSync } from "child_process";

// ─── DB reset helper ─────────────────────────────────────────────────────────
function resetDB() {
  execSync('node -e "const {PrismaClient}=require(\'@prisma/client\');const p=new PrismaClient();p.auditLog.deleteMany({}).then(()=>p.reportEntry.deleteMany({})).then(()=>p.dailyReport.deleteMany({})).then(()=>{console.log(\'DB cleared\');p.$disconnect()})"', {
    cwd: "C:\\Users\\Sai Kumar\\OneDrive\\Desktop\\vishalaShoppingMall",
    stdio: "pipe",
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  await page.locator("input").first().fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 });
}

async function logout(page: Page) {
  await page.locator("button", { hasText: /sign out/i }).click();
  await page.waitForURL("**/login**", { timeout: 10000 });
}

// Wait for the admin grid counter rows to appear (cell-0-1 = first CASH input)
async function waitForGrid(page: Page) {
  await page.waitForSelector("#cell-0-1", { timeout: 20000 });
}

// ─── SUITE 1: Login ──────────────────────────────────────────────────────────
test.describe("1. Login", () => {
  test("redirects unauthenticated user to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/, { timeout: 10000 });
  });

  test("shows form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input").first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("rejects bad credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input").first().fill("nobody");
    await page.locator('input[type="password"]').fill("wrong");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/login/);
  });

  test("admin1 logs in and reaches dashboard", async ({ page }) => {
    await loginAs(page, "admin1", "admin123");
    await expect(page).toHaveURL(/dashboard/);
  });

  test("superadmin logs in and reaches dashboard", async ({ page }) => {
    await loginAs(page, "superadmin", "superadmin123");
    await expect(page).toHaveURL(/dashboard/);
  });
});

// ─── SUITE 2: Admin Dashboard ────────────────────────────────────────────────
test.describe("2. Admin Dashboard", () => {
  test.beforeAll(() => resetDB());

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin1", "admin123");
  });

  test("header shows Report title", async ({ page }) => {
    await expect(page.locator("h2")).toContainText(/Report/i, { timeout: 8000 });
  });

  test("grid has correct column headers", async ({ page }) => {
    await waitForGrid(page);
    const headers = await page.locator("thead th").allTextContents();
    const text = headers.join(" ").toUpperCase();
    expect(text).toContain("C.N");
    expect(text).toContain("CASH");
    expect(text).toContain("G.PAY");
    expect(text).toContain("CARD");
    expect(text).toContain("DUE");
    expect(text).toContain("COUNTER FLOW");
    expect(text).toContain("+/-");
    expect(text).toContain("C.T");
  });

  test("Branch 1 has 15 counter rows", async ({ page }) => {
    await waitForGrid(page);
    // Count CASH cell inputs — one per counter row (id=cell-N-1)
    const cashCells = page.locator('[id^="cell-"][id$="-1"]');
    await expect(cashCells).toHaveCount(15, { timeout: 5000 });
  });

  test("System Counter panel is visible", async ({ page }) => {
    await waitForGrid(page);
    await expect(page.locator("text=SYSTEM COUNTER")).toBeVisible();
    await expect(page.locator("text=G TOTAL")).toBeVisible();
    await expect(page.locator("text=DIFFERENCE")).toBeVisible();
  });

  test("Due Bills panel is visible", async ({ page }) => {
    await waitForGrid(page);
    await expect(page.locator("text=Due Bills").first()).toBeVisible();
  });

  test("can type a cash value in counter 1", async ({ page }) => {
    await waitForGrid(page);
    await page.locator("#cell-0-1").click();
    await page.locator("#cell-0-1").fill("5000");
    await page.locator("#cell-0-1").press("Tab");
    await page.waitForTimeout(300);
    const val = await page.locator("#cell-0-1").inputValue();
    expect(val).toMatch(/5[,.]?000/);
  });

  test("can expand due bill sub-row and fill fields", async ({ page }) => {
    await waitForGrid(page);
    // Click the toggle (▶) on the first counter row
    await page.locator("table").first().locator("tbody tr").first().locator("button").first().click();
    await expect(page.locator('input[placeholder="e.g. BL-001"]')).toBeVisible({ timeout: 5000 });
    await page.locator('input[placeholder="e.g. BL-001"]').fill("BL-999");
    await page.locator('input[placeholder="Customer name"]').fill("Test Customer");
    await page.locator('input[placeholder="0"]').fill("2500");
    // Due Bills summary panel should now list the entry
    await expect(page.locator("text=BL-999")).toBeVisible({ timeout: 3000 });
  });

  test("Save Draft button works", async ({ page }) => {
    await waitForGrid(page);
    await page.locator("button", { hasText: /save draft/i }).click();
    await expect(page.locator("text=Draft auto-saved")).toBeVisible({ timeout: 15000 });
  });

  test("Export button is present", async ({ page }) => {
    await expect(page.locator("a", { hasText: /export/i })).toBeVisible();
  });

  test("Sign out returns to login", async ({ page }) => {
    await logout(page);
    await expect(page).toHaveURL(/login/);
  });
});

// ─── SUITE 3: Auto-save & persistence ───────────────────────────────────────
test.describe("3. Auto-save & Persistence", () => {
  test.beforeAll(() => resetDB());

  test("value auto-saves and persists after reload", async ({ page }) => {
    await loginAs(page, "admin2", "admin123");
    await waitForGrid(page);

    // Find Counter 1 row by its name cell and get the sibling CASH input
    // Counter rows are sorted alphabetically so we locate by text
    const counter1Row = page.locator("table tbody tr").filter({ hasText: /^Counter 1$/ }).first();
    const cashInput = counter1Row.locator('input[id^="cell-"]').first();

    await page.waitForTimeout(500);
    await cashInput.click();
    await cashInput.fill("88888");
    await cashInput.press("Tab");

    // Click Save Draft to guarantee persistence
    await page.locator("button", { hasText: /save draft/i }).click();
    await expect(page.locator("text=Draft auto-saved")).toBeVisible({ timeout: 15000 });

    await page.reload();
    await waitForGrid(page);

    // After reload, find Counter 1 again and verify value
    const counter1RowAfter = page.locator("table tbody tr").filter({ hasText: /^Counter 1$/ }).first();
    const cashInputAfter = counter1RowAfter.locator('input[id^="cell-"]').first();
    const val = await cashInputAfter.inputValue();
    expect(val).toMatch(/88[,.]?888/);
  });
});

// ─── SUITE 4: Super Admin ────────────────────────────────────────────────────
test.describe("4. Super Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superadmin", "superadmin123");
  });

  test("shows Super Admin Monitoring heading", async ({ page }) => {
    await expect(page.locator("h2")).toContainText(/Super Admin/i, { timeout: 8000 });
  });

  test("shows Overview tab with Branch Submissions Tracker", async ({ page }) => {
    await expect(page.locator("text=Branch Submissions Tracker")).toBeVisible({ timeout: 10000 });
  });

  test("Branch Submissions Tracker shows both branches", async ({ page }) => {
    await expect(page.locator("text=Branch Submissions Tracker")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("cell", { name: "Siddipet" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Sircilla" })).toBeVisible();
  });

  test("Audit Logs tab works", async ({ page }) => {
    await page.locator("button", { hasText: /audit logs/i }).click();
    await expect(page.locator("text=System Security Audit Logs")).toBeVisible({ timeout: 5000 });
  });

  test("can select Siddipet branch for sheet review", async ({ page }) => {
    await page.waitForSelector("text=Individual Branch Sheet Review", { timeout: 10000 });
    await page.locator("select").selectOption({ label: "Siddipet" });
    // The review ExcelGrid renders — wait for any cell in it
    await page.waitForSelector('[id^="cell-0-"]', { timeout: 15000 });
    await expect(page.locator("table").last()).toBeVisible();
  });

  test("review grid shows LOCKED badge", async ({ page }) => {
    await page.waitForSelector("text=Individual Branch Sheet Review", { timeout: 10000 });
    await page.locator("select").selectOption({ label: "Siddipet" });
    await page.waitForSelector('[id^="cell-0-"]', { timeout: 15000 });
    await expect(page.locator("text=LOCKED").last()).toBeVisible();
  });

  test("Sign out returns to login", async ({ page }) => {
    await logout(page);
    await expect(page).toHaveURL(/login/);
  });
});
