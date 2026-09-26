import { describe, expect, it, vi } from "vitest";
import { assertSafeExternalUrl, isPrivateAddress, isSafeExternalUrl, safeExternalFetch } from "./safeUrl.js";

describe("protección SSRF", () => {
  it("rechaza protocolos, credenciales, puertos e IPs literales", () => {
    expect(isSafeExternalUrl("http://example.com/a")).toBe(false);
    expect(isSafeExternalUrl("https://user:pass@example.com/a")).toBe(false);
    expect(isSafeExternalUrl("https://example.com:8443/a")).toBe(false);
    expect(isSafeExternalUrl("https://127.0.0.1/a")).toBe(false);
    expect(isSafeExternalUrl("https://[::1]/a")).toBe(false);
    expect(isSafeExternalUrl("https://cdn.example.com/a")).toBe(true);
  });

  it("clasifica rangos privados, metadata y documentación", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.1.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("rechaza un hostname público que resuelve a una red privada", async () => {
    const lookup = vi.fn(async () => [{ address: "169.254.169.254", family: 4 }]);
    await expect(assertSafeExternalUrl("https://images.example.com/a.jpg", lookup)).rejects.toThrow(/privada/);
  });

  it("vuelve a validar el destino de cada redirección", async () => {
    const lookup = vi.fn(async (host) => [{ address: host === "safe.example.com" ? "1.1.1.1" : "127.0.0.1", family: 4 }]);
    const fetchFn = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://internal.example.com/secret" } }));
    await expect(safeExternalFetch("https://safe.example.com/start", {}, { lookupFn: lookup, fetchFn })).rejects.toThrow(/privada/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("pasa a la descarga únicamente una resolución pública ya validada", async () => {
    const lookup = vi.fn(async () => [{ address: "1.1.1.1", family: 4 }]);
    const fetchFn = vi.fn(async () => new Response("ok"));
    const response = await safeExternalFetch("https://safe.example.com/file", {}, { lookupFn: lookup, fetchFn });
    expect(response.status).toBe(200);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
