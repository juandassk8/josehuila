// La regla de portadas es fuente única para 5 lugares. Un cambio acá cambia qué
// se ve en el Banco, el pipeline y el portal del cliente a la vez.
import { describe, it, expect } from "vitest";
import { isUsableCover, coverIsExpired, isOwnStorage, videoIsCanvasReadable, bestCover } from "../coverUrl.js";

const STORAGE = "https://gfuxpggkmmeismrrjxqh.database.co/storage/v1/object/public/despliegue-examples/bank-covers/1.jpg";
const FOREPLAY = "https://r2.foreplay.co/3467127389f4754c84e496f5f8ca8ae3ab0dbe327.jpg";
const FBCDN = "https://scontent-gru1-2.xx.fbcdn.net/v/t39.35426-6/721861393.jpg";
const FBCDN_FNA = "https://scontent.fplu18-1.fna.fbcdn.net/v/t39.35426-6/744169.jpg";

describe("isUsableCover", () => {
  it("acepta lo alojado por nosotros", () => {
    expect(isUsableCover(STORAGE)).toBe(true);
  });

  it("acepta Foreplay — funciona y antes se descartaba por error", () => {
    expect(isUsableCover(FOREPLAY)).toBe(true);
  });

  it("rechaza las de Meta, que caducan", () => {
    expect(isUsableCover(FBCDN)).toBe(false);
    expect(isUsableCover(FBCDN_FNA)).toBe(false);
    expect(isUsableCover("https://x.fbsbx.com/v/a.jpg")).toBe(false);
    expect(isUsableCover("https://www.facebook.com/ads/image/a.jpg")).toBe(false);
  });

  it("rechaza vacío, espacios y nulos", () => {
    for (const v of ["", "   ", null, undefined]) expect(isUsableCover(v)).toBe(false);
  });

  it("acepta hosts desconocidos: se asume que sirve salvo prueba en contra", () => {
    // Es el cambio de criterio. Antes se borraban; ahora se intentan y si fallan
    // la tarjeta cae al rayado por su onError.
    expect(isUsableCover("https://cdn.otroproveedor.com/x.jpg")).toBe(true);
  });

  it("coverIsExpired es exactamente su negación", () => {
    for (const u of [STORAGE, FOREPLAY, FBCDN, "", null, "https://a.com/b.jpg"]) {
      expect(coverIsExpired(u)).toBe(!isUsableCover(u));
    }
  });
});

describe("isOwnStorage", () => {
  it("distingue lo nuestro de lo ajeno, para saber qué re-hostear", () => {
    expect(isOwnStorage(STORAGE)).toBe(true);
    expect(isOwnStorage(FOREPLAY)).toBe(false);
    expect(isOwnStorage(FBCDN)).toBe(false);
    expect(isOwnStorage("")).toBe(false);
  });
});

describe("videoIsCanvasReadable", () => {
  it("solo nuestro Storage manda CORS, que es lo que permite sacar el fotograma", () => {
    expect(videoIsCanvasReadable("https://x.database.co/storage/v1/object/public/a/v.mp4")).toBe(true);
    expect(videoIsCanvasReadable("https://drive.google.com/file/d/abc/view")).toBe(false);
    expect(videoIsCanvasReadable("")).toBe(false);
  });
});

describe("bestCover — no degradar una portada buena", () => {
  it("nuestro Storage gana siempre", () => {
    expect(bestCover(FBCDN, STORAGE)).toBe(STORAGE);
    expect(bestCover(STORAGE, FOREPLAY)).toBe(STORAGE);
    expect(bestCover(FOREPLAY, STORAGE)).toBe(STORAGE);
  });
  it("una utilizable gana sobre una vencida", () => {
    expect(bestCover(FBCDN, FOREPLAY)).toBe(FOREPLAY);
    expect(bestCover(FOREPLAY, FBCDN)).toBe(FOREPLAY);
  });
  it("el caso real: el banco vencido NO pisa la buena del cliente", () => {
    // Antes: `src.file_url || dest.file_url` → ganaba la del banco por ser truthy.
    expect(bestCover(FBCDN, STORAGE)).toBe(STORAGE);
  });
  it("si las dos son malas conserva algo antes que perder todo", () => {
    expect(bestCover(FBCDN, "")).toBe(FBCDN);
    expect(bestCover("", FBCDN)).toBe(FBCDN);
    expect(bestCover("", "")).toBeNull();
  });
});
