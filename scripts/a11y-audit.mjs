import fs from "node:fs/promises";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const axeSource = await fs.readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const baseUrl = process.env.A11Y_BASE_URL || "http://127.0.0.1:3000";
const routes = ["/", "/connection", "/history"];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  routes: [],
};

try {
  for (const route of routes) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
    await page.addScriptTag({ content: axeSource });

    const axe = await page.evaluate(async () => {
      const result = await globalThis.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      });
      return {
        violations: result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          description: violation.description,
          nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
        })),
        passes: result.passes.length,
        incomplete: result.incomplete.map((item) => item.id),
      };
    });

    const focusSequence = [];
    for (let index = 0; index < 24; index += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement) || element === document.body) return null;
        const style = getComputedStyle(element);
        const label = element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || element.getAttribute("name") || element.id;
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

    const reducedMotion = await page.evaluate(() => ({
      preferenceMatched: matchMedia("(prefers-reduced-motion: reduce)").matches,
      animatedElementCount: [...document.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element);
        return style.animationName !== "none" && style.animationDuration !== "0s";
      }).length,
    }));

    report.routes.push({ route, axe, focusSequence, reducedMotion });
    await page.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(new URL("../accessibility-report.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);

const violations = report.routes.flatMap((entry) => entry.axe.violations);
if (violations.length > 0) {
  console.error(`Accessibility audit found ${violations.length} route-level violation groups.`);
  process.exitCode = 1;
} else {
  console.log(`Accessibility audit passed on ${report.routes.length} routes with no WCAG A/AA violations.`);
}
