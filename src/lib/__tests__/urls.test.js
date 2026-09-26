import { describe, it, expect } from "vitest";
import {
  getCompanySlug,
  clientHomePath,
  clientReportPath,
  teamCompanyWorkspaceReportPath,
  legacyHashToPath,
} from "../urls.js";

describe("getCompanySlug", () => {
  it("prefers an explicit slug", () => {
    expect(getCompanySlug({ slug: "acme", name: "Acme Corp" })).toBe("acme");
  });

  it("derives a slug from the name when slug is missing", () => {
    expect(getCompanySlug({ name: "Acme Corp" })).toBe("acme-corp");
  });

  it("returns empty string for null company", () => {
    expect(getCompanySlug(null)).toBe("");
  });
});

describe("path builders", () => {
  it("builds client paths", () => {
    expect(clientHomePath("acme")).toBe("/cliente/acme");
    expect(clientReportPath("acme", 7)).toBe("/cliente/acme/reporte/7");
  });

  it("builds team workspace report path", () => {
    expect(teamCompanyWorkspaceReportPath(3, 9)).toBe("/equipo/empresas/3/reportes/9");
  });
});

describe("legacyHashToPath", () => {
  it("maps a legacy hash to a team path", () => {
    expect(legacyHashToPath("#/agenda/hoy")).toBe("/equipo/agenda/hoy");
    expect(legacyHashToPath("#agenda")).toBe("/equipo/agenda");
  });

  it("returns null for empty hash", () => {
    expect(legacyHashToPath("")).toBeNull();
    expect(legacyHashToPath("#")).toBeNull();
  });
});
