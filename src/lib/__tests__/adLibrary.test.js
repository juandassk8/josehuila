import { describe, it, expect } from "vitest";
import { extractAdLibraryPageId } from "../adLibrary.js";

describe("extractAdLibraryPageId", () => {
  it("extrae el page_id de un link de la Ad Library", () => {
    const url =
      "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=123456789012345&sort_data[direction]=desc";
    expect(extractAdLibraryPageId(url)).toBe("123456789012345");
  });

  it("es case-insensitive en el parámetro", () => {
    expect(extractAdLibraryPageId("...&VIEW_ALL_PAGE_ID=999888777")).toBe("999888777");
  });

  it("acepta un page_id pegado directo (solo dígitos)", () => {
    expect(extractAdLibraryPageId("104958372910")).toBe("104958372910");
    expect(extractAdLibraryPageId("  104958372910  ")).toBe("104958372910");
  });

  it("devuelve null para un nombre de marca normal", () => {
    expect(extractAdLibraryPageId("Cymbiotika")).toBeNull();
    expect(extractAdLibraryPageId("Everyday Dose")).toBeNull();
    expect(extractAdLibraryPageId("12345")).toBeNull(); // muy corto para un page_id
  });

  it("maneja vacío / nullish", () => {
    expect(extractAdLibraryPageId("")).toBeNull();
    expect(extractAdLibraryPageId(null)).toBeNull();
    expect(extractAdLibraryPageId(undefined)).toBeNull();
  });
});
