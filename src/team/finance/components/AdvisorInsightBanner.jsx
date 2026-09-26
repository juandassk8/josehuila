// Banner colapsable con la última recomendación del AI Advisor.
// Muestra los primeros ~240 chars + botón "Ver completo" que navega a la
// tab Advisor. Si el mensaje tiene tags [ACTION], los lista debajo.

import { useEffect, useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { getLatestAdvisorMessage } from "../data/financeDb.js";

function extractActions(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*\[ACTION\]\s+(.+?)\s*$/i);
    if (m && m[1]) out.push(m[1].trim());
  }
  return out;
}
function stripActionTags(text) {
  return (text || "")
    .split("\n")
    .filter((line) => !/^\s*\[ACTION\]/i.test(line))
    .join("\n")
    .trim();
}

const DISMISS_KEY = "finance-advisor-banner-dismissed";

export function AdvisorInsightBanner({ onNavigate }) {
  const [message, setMessage] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    getLatestAdvisorMessage().then(({ data }) => {
      if (data?.content) {
        setMessage(data);
        // Check si ya descartó este mensaje (por id)
        try {
          const dismissedId = localStorage.getItem(DISMISS_KEY);
          if (dismissedId === data.id) setCollapsed(true);
        } catch {}
      }
    });
  }, []);

  if (!message) return null;
  if (collapsed) return null;

  const actions = extractActions(message.content);
  const body = stripActionTags(message.content);
  const preview = body.length > 280 ? body.slice(0, 280).trim() + "…" : body;
  const truncated = body.length > 280;

  const dismiss = () => {
    setCollapsed(true);
    try { localStorage.setItem(DISMISS_KEY, message.id); } catch {}
  };

  return (
    <div style={{
      padding: 14,
      borderRadius: 14,
      background: `linear-gradient(135deg, ${withAlpha(DS.green, "12")}, ${withAlpha(DS.blue, "08")})`,
      border: `1px solid ${withAlpha(DS.green, "44")}`,
      marginBottom: 14,
      fontFamily: DS.font,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ fontSize: 22 }}>💡</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: DS.green,
            letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4,
          }}>
            Última recomendación del AI Advisor
          </div>
          <div style={{
            fontSize: 13, color: DS.textPrimary, lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}>
            {preview}
          </div>
          {(truncated || actions.length > 0) && (
            <button
              onClick={() => onNavigate?.("advisor")}
              style={{
                marginTop: 8,
                padding: "5px 12px", borderRadius: 50,
                border: `1px solid ${withAlpha(DS.green, "55")}`,
                background: "transparent",
                color: DS.green,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: DS.font,
              }}
            >
              {actions.length > 0 ? `${actions.length} acción${actions.length !== 1 ? "es" : ""} → Ver en Advisor` : "Ver respuesta completa →"}
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          title="Ocultar"
          style={{
            background: "transparent", border: "none",
            color: DS.textMuted, fontSize: 14, cursor: "pointer",
            fontFamily: DS.font, padding: 4,
          }}
        >✕</button>
      </div>
    </div>
  );
}
