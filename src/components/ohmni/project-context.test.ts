import { describe, expect, it, vi } from "vitest";

let session: { access_token: string } | null = null;
vi.mock("../../lib/client/ohmni", () => ({
  ohmni: {},
  supabaseBrowser: () => ({ auth: { getSession: async () => ({ data: { session } }) } }),
}));
const { aiCallContext } = await import("./project-context");

const CTX = { projectId: "p1", workspaceId: "w1", label: "w / p", aiProcessing: false };

describe("lab AI call context (workspace AI switch)", () => {
  it("no selected project or not signed in: anonymous call, nothing attached", async () => {
    session = { access_token: "tok" };
    expect(await aiCallContext(null)).toEqual({});
    session = null;
    expect(await aiCallContext(CTX)).toEqual({});
  });

  it("signed in with a selected project: sends projectId and the Bearer token the server needs", async () => {
    session = { access_token: "tok" };
    expect(await aiCallContext(CTX)).toEqual({ projectId: "p1", headers: { Authorization: "Bearer tok" } });
  });

  it("the lab disables upload and attaches the context on /api/extract", async () => {
    const src = (await import("node:fs")).readFileSync("src/components/ohmni/lab-workspace.tsx", "utf8");
    expect(src).toContain('body.append("projectId", ctx.projectId)');
    expect(src).toContain('request("/api/extract", body, ctx.headers)');
    expect(src.match(/disabled=\{pending \|\| !aiConsent \|\| aiOff\}/g)?.length).toBe(2);
  });
});
