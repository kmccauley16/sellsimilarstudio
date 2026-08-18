import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
import puppeteer from "puppeteer-core";
import { listingImports } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { createListingImport, getDb, getUserByOpenId, upsertUser } from "../server/db";
import { sdk } from "../server/_core/sdk";

const require = createRequire(import.meta.url);
const axeSource = await fs.readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const baseUrl = process.env.A11Y_BASE_URL || "http://127.0.0.1:3000";
const openId = process.env.OWNER_OPEN_ID;
if (!openId) throw new Error("OWNER_OPEN_ID is required for the authenticated audit.");

await upsertUser({ openId, name: "Accessibility audit", loginMethod: "audit", lastSignedIn: new Date() });
const user = await getUserByOpenId(openId);
if (!user) throw new Error("Unable to create the authenticated audit user.");

const fixture = await createListingImport(user.id, {
  sourceUrl: "https://www.ebay.com/itm/123456789012",
  sourceItemId: "123456789012",
  title: "Authenticated accessibility audit fixture",
  description: "Temporary fixture used to validate the editable review workspace.",
  itemSpecifics: [
    { name: "Brand", value: "Unbranded" },
    { name: "Type", value: "Test fixture" },
  ],
  imageUrls: ["data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="],
  conditionId: "3000",
  conditionName: "Used",
  price: "24.99",
  currency: "USD",
  categoryId: "1",
  categoryName: "Collectibles",
  importMethod: "html",
  warnings: [],
});
if (!fixture) throw new Error("Unable to create the review audit fixture.");

const token = await sdk.createSessionToken(openId, { name: "Accessibility audit", expiresInMs: 10 * 60 * 1000 });
const routes = ["/", `/review/${fixture.id}`, "/connection", "/history"];
const report: {
  generatedAt: string;
  baseUrl: string;
  routes: Array<Record<string, unknown>>;
  errorAnnouncement?: Record<string, unknown>;
} = { generatedAt: new Date().toISOString(), baseUrl, routes: [] };

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const route of routes) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.setCookie({ name: COOKIE_NAME, value: token, url: baseUrl, httpOnly: true, sameSite: "Lax" });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
    await page.addScriptTag({ content: axeSource });

    const axe = await page.evaluate(async () => {
      const result = await globalThis.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      });
      return {
        violations: result.violations.map((violation: any) => ({
          id: violation.id,
          impact: violation.impact,
          description: violation.description,
          nodes: violation.nodes.map((node: any) => ({ target: node.target, summary: node.failureSummary })),
        })),
        passes: result.passes.length,
        incomplete: result.incomplete.map((item: any) => item.id),
      };
    });

    const focusSequence: Array<Record<string, unknown>> = [];
    for (let index = 0; index < 48; index += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement) || element === document.body) return null;
        const style = getComputedStyle(element);
        const label = element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) || element.getAttribute("name") || element.id;
        return {
          tag: element.tagName.toLowerCase(),
          label,
          visibleIndicator: style.outlineStyle !== "none" || style.boxShadow !== "none",
        };
      });
      if (!focused) continue;
      const previous = focusSequence.at(-1);
      if (!previous || previous.tag !== focused.tag || previous.label !== focused.label) focusSequence.push(focused);
    }

    const semantics = await page.evaluate(() => ({
      labeledControls: [...document.querySelectorAll("input, textarea, select, button")].filter((element) => {
        const id = element.getAttribute("id");
        return Boolean(element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || element.textContent?.trim());
      }).length,
      controls: document.querySelectorAll("input, textarea, select, button").length,
      liveRegions: [...document.querySelectorAll("[role='alert'], [role='status'], [aria-live]")].map((element) => ({
        role: element.getAttribute("role"),
        ariaLive: element.getAttribute("aria-live"),
      })),
      reducedMotionMatched: matchMedia("(prefers-reduced-motion: reduce)").matches,
      animatedElementCount: [...document.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element);
        const durations = style.animationDuration.split(",").map(value => {
          const duration = Number.parseFloat(value);
          return value.trim().endsWith("ms") ? duration : duration * 1000;
        });
        return style.animationName !== "none" && durations.some(durationMs => durationMs > 10);
      }).length,
    }));

    report.routes.push({ route, axe, focusSequence, semantics });

    if (route === "/") {
      await page.type('input[aria-label="eBay sold listing URL"]', "not-an-ebay-url");
      await page.$$eval("button", buttons => {
        const button = buttons.find(candidate => candidate.textContent?.trim().includes("Import listing"));
        if (!(button instanceof HTMLButtonElement)) throw new Error("Import button was not found.");
        button.click();
      });
      await page.waitForSelector('[role="alert"]', { timeout: 10000 });
      report.errorAnnouncement = await page.evaluate(() => {
        const alert = document.querySelector('[role="alert"]');
        return { present: Boolean(alert), text: alert?.textContent?.trim() || "" };
      });
    }

    await page.close();
  }
} finally {
  await browser.close();
  const db = await getDb();
  if (db) await db.delete(listingImports).where(eq(listingImports.id, fixture.id));
}

await fs.writeFile(new URL("../accessibility-authenticated-report.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
const violations = report.routes.flatMap((entry: any) => entry.axe.violations);
const focusFailures = report.routes.flatMap((entry: any) => entry.focusSequence.filter((item: any) => !item.visibleIndicator));
const unlabeled = report.routes.filter((entry: any) => entry.semantics.labeledControls !== entry.semantics.controls);
const motionFailures = report.routes.filter((entry: any) => !entry.semantics.reducedMotionMatched || entry.semantics.animatedElementCount > 0);
const announcementFailed = !report.errorAnnouncement?.present || !report.errorAnnouncement.text;

if (violations.length || focusFailures.length || unlabeled.length || motionFailures.length || announcementFailed) {
  console.error(JSON.stringify({ violations: violations.length, focusFailures: focusFailures.length, unlabeledRoutes: unlabeled.length, motionFailures: motionFailures.length, announcementFailed }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Authenticated accessibility audit passed on ${report.routes.length} routes.`);
}

process.exit(process.exitCode ?? 0);
