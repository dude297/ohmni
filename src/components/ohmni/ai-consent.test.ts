import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withAiConsent } from "./ai-consent";

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const norm = (p: string) => p.replaceAll("\\", "/");

describe("AI consent", () => {
  it("adds aiConsent: true only with consent", () => {
    expect(withAiConsent({ graph: 1 }, true)).toEqual({ graph: 1, aiConsent: true });
    expect(withAiConsent({ graph: 1 }, false)).toEqual({ graph: 1 });
  });

  it("the consent-enforcing server routes are exactly the ones this test covers", () => {
    const enforcing = walk("src/app/api").filter((f) => /consentMissing\(/.test(readFileSync(f, "utf8"))).map(norm).sort();
    expect(enforcing).toEqual(["src/app/api/explain/route.ts", "src/app/api/extract/route.ts", "src/app/api/review/route.ts"]);
  });

  it("every UI that calls a model route sends aiConsent", () => {
    const callers = walk("src")
      .filter((f) => f.endsWith(".tsx") && !norm(f).startsWith("src/app/api/"))
      .filter((f) => /["'`]\/api\/(explain|extract|review)["'`]/.test(readFileSync(f, "utf8")))
      .map(norm)
      .sort();
    expect(callers).toEqual([
      "src/app/for-the-larp/voice-lab/voice-lab.tsx",
      "src/app/probe/probe-client.tsx",
      "src/app/review/review-client.tsx",
      "src/components/ohmni/lab-workspace.tsx",
    ]);
    for (const f of callers) {
      const src = readFileSync(f, "utf8");
      // JSON routes go through withAiConsent; /api/extract is multipart (field aiConsent=true).
      expect(src.includes("withAiConsent(") || src.includes('append("aiConsent", "true")'), f).toBe(true);
      expect(src.includes("useAiConsent()"), f).toBe(true);
    }
  });
});
