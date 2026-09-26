import { describe, it, expect } from "vitest";
import { isDriveLink, driveFileId, drivePreviewUrl, driveDownloadUrl } from "../driveLinks.js";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("isDriveLink", () => {
  it("detects drive and docs google links", () => {
    expect(isDriveLink("https://drive.google.com/file/d/x/view")).toBe(true);
    expect(isDriveLink("https://docs.google.com/document/d/x")).toBe(true);
  });

  it("is false for non-drive urls and empty input", () => {
    expect(isDriveLink("https://youtube.com/watch")).toBe(false);
    expect(isDriveLink("")).toBe(false);
    expect(isDriveLink(null)).toBe(false);
  });
});

describe("driveFileId", () => {
  it("extracts id from /d/<id>/ form", () => {
    expect(driveFileId(`https://drive.google.com/file/d/${ID}/view`)).toBe(ID);
  });

  it("extracts id from ?id=<id> form", () => {
    expect(driveFileId(`https://drive.google.com/uc?id=${ID}`)).toBe(ID);
  });

  it("returns null when no id present", () => {
    expect(driveFileId("https://drive.google.com/")).toBeNull();
    expect(driveFileId("")).toBeNull();
  });
});

describe("drivePreviewUrl / driveDownloadUrl", () => {
  it("builds a preview iframe url", () => {
    expect(drivePreviewUrl(`https://drive.google.com/file/d/${ID}/view`)).toBe(
      `https://drive.google.com/file/d/${ID}/preview`,
    );
  });

  it("returns null preview when no id", () => {
    expect(drivePreviewUrl("nope")).toBeNull();
  });

  it("builds a direct download url when id present", () => {
    expect(driveDownloadUrl(`https://drive.google.com/file/d/${ID}/view`)).toBe(
      `https://drive.google.com/uc?export=download&id=${ID}`,
    );
  });

  it("falls back to original url when no id", () => {
    expect(driveDownloadUrl("https://example.com/x")).toBe("https://example.com/x");
  });
});
