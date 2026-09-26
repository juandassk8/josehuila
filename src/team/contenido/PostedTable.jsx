import { useState, useEffect, useMemo } from "react";
import { DS, darkInput } from "../../lib/design.js";
import { fmtShort } from "../../lib/dates.js";
import { listAllPostedWithMetrics, addMetrics } from "../data/contentDb.js";
import { ContentModal } from "./ContentModal.jsx";

export function PostedTable({ items, members, currentMember }) {
  const [postedItems, setPostedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingFor, setAddingFor] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data } = await listAllPostedWithMetrics();
    setPostedItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [items]);

  const sorted = useMemo(
    () => [...postedItems].sort((a, b) => {
      const da = a.scheduled_date || a.created_at;
      const db = b.scheduled_date || b.created_at;
      return new Date(db) - new Date(da);
    }),
    [postedItems]
  );

  return (
    <div style={{ fontFamily: DS.font }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14 }}>
        CONTENIDO PUBLICADO · {sorted.length} items
      </div>

      {loading ? (
        <div style={{ color: DS.textMuted, fontSize: 12 }}>Cargando…</div>
      ) : sorted.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "40px 20px", color: DS.textMuted, fontSize: 12,
          border: DS.borderDash, borderRadius: 14,
        }}>
          Aún no hay contenido publicado. Mueve items a "Posted" en el pipeline.
        </div>
      ) : (
        <div style={{
          border: DS.border, borderRadius: 14, overflow: "hidden",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 0.7fr 0.7fr 0.6fr 0.6fr 0.6fr 0.6fr 0.7fr 1fr",
            padding: "10px 14px", background: DS.bgCard,
            fontWeight: 700, color: DS.textMuted, fontSize: 9,
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <span>Título</span>
            <span>Fecha</span>
            <span>Link</span>
            <span>Views</span>
            <span>Likes</span>
            <span>Comm.</span>
            <span>Saves</span>
            <span>Eng. Rate</span>
            <span>Acción</span>
          </div>

          {sorted.map((item) => {
            const latestMetric = (item.metrics || []).sort(
              (a, b) => new Date(b.captured_at) - new Date(a.captured_at)
            )[0];

            return (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 0.7fr 0.7fr 0.6fr 0.6fr 0.6fr 0.6fr 0.7fr 1fr",
                  padding: "10px 14px", borderTop: DS.border,
                  alignItems: "center", fontSize: 12,
                }}
              >
                <button
                  onClick={() => setEditing(item)}
                  style={{
                    background: "transparent", border: "none", color: DS.textPrimary,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
                    padding: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {item.kind === "video" ? "🎬" : item.kind === "story" ? "📱" : "📝"} {item.title}
                </button>
                <span style={{ color: DS.textSecondary, fontSize: 11 }}>
                  {fmtShort(item.scheduled_date || item.created_at)}
                </span>
                <span>
                  {item.link_video_final ? (
                    <a href={item.link_video_final} target="_blank" rel="noopener"
                      style={{ color: DS.blue, fontSize: 10, textDecoration: "none" }}>
                      🔗 Ver
                    </a>
                  ) : (
                    <span style={{ color: DS.textMuted, fontSize: 10 }}>—</span>
                  )}
                </span>
                <MetricCell value={latestMetric?.views} />
                <MetricCell value={latestMetric?.likes} />
                <MetricCell value={latestMetric?.comments} />
                <MetricCell value={latestMetric?.saves} />
                <MetricCell
                  value={latestMetric?.engagement_rate}
                  format={(v) => `${Number(v).toFixed(2)}%`}
                  color={DS.green}
                />
                <div>
                  <button
                    onClick={() => setAddingFor(item)}
                    style={{
                      padding: "5px 12px", borderRadius: 50,
                      border: `1px solid ${DS.green}40`, background: DS.green + "18",
                      color: DS.green, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    + Métricas
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addingFor && (
        <MetricsModal
          item={addingFor}
          currentMember={currentMember}
          onClose={() => setAddingFor(null)}
          onSaved={() => { setAddingFor(null); load(); }}
        />
      )}

      {editing && (
        <ContentModal
          item={editing}
          members={members}
          currentMember={currentMember}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function MetricCell({ value, format: fmt, color }) {
  if (value == null || value === 0) return <span style={{ color: DS.textMuted, fontSize: 11 }}>—</span>;
  return (
    <span style={{ color: color || DS.textPrimary, fontSize: 12, fontWeight: 600 }}>
      {fmt ? fmt(value) : Number(value).toLocaleString()}
    </span>
  );
}

function MetricsModal({ item, currentMember, onClose, onSaved }) {
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");
  const [saves, setSaves] = useState("");
  const [reach, setReach] = useState("");
  const [engRate, setEngRate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await addMetrics({
      content_item_id: item.id,
      views: parseInt(views) || 0,
      likes: parseInt(likes) || 0,
      comments: parseInt(comments) || 0,
      shares: parseInt(shares) || 0,
      saves: parseInt(saves) || 0,
      reach: parseInt(reach) || 0,
      engagement_rate: parseFloat(engRate) || null,
      captured_by: currentMember?.id,
    });
    setSaving(false);
    onSaved?.();
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: 10000, fontFamily: DS.font,
      }}
    >
      <div style={{
        background: DS.bgSide, border: DS.border,
        borderRadius: 18, padding: 24, width: "100%", maxWidth: 440, color: DS.textPrimary,
      }}>
        <div style={{ fontSize: 10, color: DS.green, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 6 }}>
          AGREGAR MÉTRICAS
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          {item.title}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <NumField label="👁 Views" value={views} onChange={setViews} />
          <NumField label="❤️ Likes" value={likes} onChange={setLikes} />
          <NumField label="💬 Comments" value={comments} onChange={setComments} />
          <NumField label="🔄 Shares" value={shares} onChange={setShares} />
          <NumField label="📌 Saves" value={saves} onChange={setSaves} />
          <NumField label="📡 Reach" value={reach} onChange={setReach} />
        </div>
        <div style={{ marginTop: 10 }}>
          <NumField label="📊 Engagement Rate (%)" value={engRate} onChange={setEngRate} step="0.01" />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: "10px 22px", borderRadius: 50, background: "transparent",
            border: DS.border, color: DS.textSecondary,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{
            padding: "10px 22px", borderRadius: 50, border: "none",
            background: DS.green, color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: saving ? "wait" : "pointer",
          }}>{saving ? "Guardando…" : "Guardar métricas"}</button>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: DS.textSecondary, marginBottom: 4, letterSpacing: "0.06em" }}>
        {label}
      </div>
      <input
        type="number"
        min="0"
        step={step || "1"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        style={{ ...darkInput, fontSize: 13 }}
      />
    </div>
  );
}
