import { describe, it, expect } from "vitest";
import { dedupeAds, claveCreativo } from "../inboxDb.js";

// Los ad_id de Meta son números largos; `adIdFromMetaUrl` pide 5+ dígitos.
const ad = (o) => ({ source_url: `https://www.facebook.com/ads/library/?id=${o.id}`, brand: "Marca", ...o });

describe("dedupeAds", () => {
  it("cuenta aparte lo que ya estaba de las copias de Meta", () => {
    const ads = [
      ad({ id: "100001", video_url: "https://cdn/a.mp4" }),
      ad({ id: "100002", video_url: "https://cdn/a.mp4" }),   // misma creatividad → copia
      ad({ id: "100003", video_url: "https://cdn/b.mp4" }),
    ];
    const r = dedupeAds(ads, { seenAdIds: new Set(["100003"]) });
    expect(r.fresh.map((a) => a.id)).toEqual(["100001"]);
    expect(r).toMatchObject({ yaEstaban: 1, copias: 1 });
  });

  it("una marca nueva no puede tener nada 'ya estaba'", () => {
    const ads = [ad({ id: "100001", video_url: "https://cdn/a.mp4" }), ad({ id: "100002", video_url: "https://cdn/a.mp4" })];
    const r = dedupeAds(ads);
    expect(r.yaEstaban).toBe(0);
    expect(r.copias).toBe(1);
  });

  it("con incluirCopias trae el lote completo", () => {
    const ads = [ad({ id: "100001", video_url: "https://cdn/a.mp4" }), ad({ id: "100002", video_url: "https://cdn/a.mp4" })];
    const r = dedupeAds(ads, { incluirCopias: true });
    expect(r.fresh).toHaveLength(2);
    expect(r.copias).toBe(0);
  });

  it("dos marcas distintas no comparten creativo", () => {
    const ads = [
      ad({ id: "100001", brand: "Uno", video_url: "https://cdn/a.mp4" }),
      ad({ id: "100002", brand: "Dos", video_url: "https://cdn/a.mp4" }),
    ];
    expect(dedupeAds(ads).fresh).toHaveLength(2);
  });

  it("un video sin archivo NO se colapsa por la miniatura", () => {
    // Meta le sacó el video: la portada suele ser genérica y compartida. Perder
    // el anuncio por eso sería peor que traerlo repetido.
    const ads = [
      ad({ id: "100001", media_type: "video", cover_url: "https://cdn/generica.jpg" }),
      ad({ id: "100002", media_type: "video", cover_url: "https://cdn/generica.jpg" }),
    ];
    expect(dedupeAds(ads).fresh).toHaveLength(2);
  });

  it("dos estáticos con la misma imagen sí son el mismo creativo", () => {
    const ads = [
      ad({ id: "100001", media_type: "image", cover_url: "https://cdn/x.jpg" }),
      ad({ id: "100002", media_type: "image", cover_url: "https://cdn/x.jpg" }),
    ];
    const r = dedupeAds(ads);
    expect(r.fresh).toHaveLength(1);
    expect(r.copias).toBe(1);
  });

  it("el mismo ad_id dos veces en el lote cuenta como ya visto, no como copia", () => {
    const ads = [ad({ id: "100009", video_url: "https://cdn/a.mp4" }), ad({ id: "100009", video_url: "https://cdn/b.mp4" })];
    const r = dedupeAds(ads);
    expect(r).toMatchObject({ yaEstaban: 1, copias: 0 });
  });

  it("no se rompe sin datos", () => {
    expect(dedupeAds([])).toMatchObject({ fresh: [], yaEstaban: 0, copias: 0 });
    expect(dedupeAds(null)).toMatchObject({ fresh: [], yaEstaban: 0, copias: 0 });
  });
});

// ── La huella persistente ────────────────────────────────────────────
// El agujero que se está tapando: la huella solo se comparaba dentro de la tanda,
// así que reimportar una marca traía de nuevo todos sus creativos con ad_id nuevo
// — y cada uno se transcribía y clasificaba otra vez.
describe("claveCreativo", () => {
  it("identifica al creativo por marca y archivo, ignorando la firma de fbcdn", () => {
    const a = { brand: "Nooro", video_url: "https://video.xx.fbcdn.net/v/t42/abc123_n.mp4?_nc_cat=1&oh=AAA" };
    const b = { brand: "Nooro", video_url: "https://video.yy.fbcdn.net/v/t42/abc123_n.mp4?_nc_cat=9&oh=ZZZ" };
    expect(claveCreativo(a)).toBe(claveCreativo(b));
    expect(claveCreativo(a)).toBe("nooro|abc123_n.mp4");
  });

  it("no confunde el mismo archivo de marcas distintas", () => {
    expect(claveCreativo({ brand: "A", video_url: "https://x/v/1.mp4" }))
      .not.toBe(claveCreativo({ brand: "B", video_url: "https://x/v/1.mp4" }));
  });

  it("un video sin URL no tiene huella: no cae a la portada", () => {
    // Hay videos distintos que comparten thumbnail. Un falso positivo ahí borra
    // trabajo real; pagar un análisis de más es más barato.
    expect(claveCreativo({ brand: "A", media_type: "video", cover_url: "https://x/p/1.jpg" })).toBeNull();
  });

  it("un estático sí usa la portada", () => {
    expect(claveCreativo({ brand: "A", media_type: "static", cover_url: "https://x/p/1.jpg" })).toBe("a|1.jpg");
  });
});

describe("dedupeAds contra lo ya importado", () => {
  const mismoVideo = (id) => ad({ id, brand: "Nooro", video_url: "https://video.xx.fbcdn.net/v/t42/abc_n.mp4?oh=" + id });

  it("descarta el creativo que ya está en la base, aunque el ad_id sea nuevo", () => {
    const r = dedupeAds([mismoVideo("111111"), mismoVideo("222222")], {
      seenCreativos: new Set(["nooro|abc_n.mp4"]),
    });
    expect(r.fresh).toHaveLength(0);
    expect(r.copias).toBe(2);
    expect(r.yaEstaban).toBe(0);   // no son "ya estaban": son copias del mismo creativo
  });

  it("sin la huella conocida, entran los dos y se pagaría dos veces", () => {
    // Este es el comportamiento anterior al arreglo, dentro de una sola tanda
    // el segundo sí se atrapaba; entre tandas, no.
    const r = dedupeAds([mismoVideo("111111")], {});
    expect(r.fresh).toHaveLength(1);
  });

  it("`incluirCopias` deja pasar aunque la huella esté repetida", () => {
    const r = dedupeAds([mismoVideo("111111")], {
      seenCreativos: new Set(["nooro|abc_n.mp4"]), incluirCopias: true,
    });
    expect(r.fresh).toHaveLength(1);
  });

  it("un creativo distinto de la misma marca no se pisa", () => {
    const otro = ad({ id: "333333", brand: "Nooro", video_url: "https://video.xx.fbcdn.net/v/t42/otro_n.mp4" });
    const r = dedupeAds([otro], { seenCreativos: new Set(["nooro|abc_n.mp4"]) });
    expect(r.fresh).toHaveLength(1);
  });
});
