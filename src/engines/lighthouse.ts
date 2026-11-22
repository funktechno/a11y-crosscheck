/**
 * Lighthouse, accessibility category only -- the score people actually quote.
 *
 * It shares the axe engine, so its findings are normally a *subset* of axe's: a curated rule
 * list weighted into a 0-100 score. Runs once per page, through its node API on a page the scan
 * prepared, with its own (mobile) device emulation and its own wait for the page to go quiet.
 *
 * `disableStorageReset` is what keeps the session: by default Lighthouse clears the origin's
 * storage, cookies included, before it navigates.
 */
import { launch, preparePage, puppeteerFor } from "../puppeteer.ts";
import type { LighthousePageResult, Plan, ResolvedSession } from "../types.ts";

/** The part of an audit's details table this tool reads. */
interface AuditItem {
  node?: { selector?: string; snippet?: string };
}

export async function runLighthouse(
  plan: Plan,
  executablePath: string,
  session: ResolvedSession | null
): Promise<Record<string, LighthousePageResult>> {
  const lighthouse = (await import("lighthouse")).default;
  const browser = await launch(puppeteerFor("lighthouse", "puppeteer-core"), executablePath);
  const out: Record<string, LighthousePageResult> = {};
  try {
    for (const p of plan.pages) {
      const page = await browser.newPage();
      try {
        await preparePage(page, plan, session, { viewport: false });
        const result = await lighthouse(
          plan.base + p,
          {
            output: "json",
            logLevel: "error",
            onlyCategories: ["accessibility"],
            disableStorageReset: true
          },
          undefined,
          // Our PuppeteerPage is the slice of the page the tool uses; Lighthouse types the full one.
          page as unknown as Parameters<typeof lighthouse>[3]
        );
        if (!result) throw new Error("lighthouse returned no result");
        const json = result.lhr;
        const cat = json.categories.accessibility;
        out[p] = {
          score: Math.round((cat.score ?? 0) * 100),
          failures: cat.auditRefs
            .map((ref) => ({ ref, a: json.audits[ref.id] }))
            .filter((x) => x.a && x.a.score !== null && x.a.score < 1)
            .map((x) => {
              const items = (x.a?.details as { items?: AuditItem[] } | undefined)?.items || [];
              return {
                id: x.a!.id,
                weight: x.ref.weight,
                title: x.a!.title,
                nodes: items.length,
                targets: items
                  .slice(0, 5)
                  .map((it) => String(it.node?.selector || it.node?.snippet || "").slice(0, 160))
                  .filter(Boolean)
              };
            })
        };
      } catch (e) {
        out[p] = {
          error: String(e instanceof Error ? e.message : e)
            .split("\n")[0]
            .slice(0, 240)
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}
