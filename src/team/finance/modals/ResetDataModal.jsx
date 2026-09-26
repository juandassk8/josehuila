// ResetDataModal — borra todos los datos transaccionales del módulo finanzas.
// Útil cuando el usuario quiere empezar desde cero después de pruebas.

import { useState } from "react";
import { DS, darkBtn, darkBtnGhost, withAlpha } from "../../../lib/design.js";
import { ModalShell, Field, ErrBox } from "./AccountModal.jsx";

export function ResetDataModal({ finance, onClose }) {
  const [resetBalances, setResetBalances] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isValid = confirm.toUpperCase() === "BORRAR";

  const submit = async () => {
    if (!isValid) {
      setError("Tenés que escribir BORRAR para confirmar.");
      return;
    }
    setBusy(true); setError("");
    try {
      await finance.wipeFinanceData({ resetAccountBalances: resetBalances });
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Resetear datos de finanzas" onClose={onClose}>
      <div style={{
        padding: 12, borderRadius: 10,
        background: withAlpha(DS.red, "12"),
        border: `1px solid ${withAlpha(DS.red, "44")}`,
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: DS.red, marginBottom: 6 }}>
          ⚠️ Esta acción no se puede deshacer.
        </div>
        <div style={{ fontSize: 12, color: DS.textPrimary, lineHeight: 1.5 }}>
          Se borrarán <strong>todas las transacciones, budget items, gastos hormiga,
          conversaciones de AI, acciones y voice logs</strong>.
          <br />
          <strong>NO se borran</strong>: cuentas, categorías, secciones, clientes,
          sueldos, suscripciones, deudas ni metas.
        </div>
      </div>

      <Field label="¿También resetear los saldos de las cuentas a $0?">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={resetBalances}
            onChange={(e) => setResetBalances(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: DS.textSecondary }}>
            Sí, también poner Bancolombia, Nequi, PayPal y Efectivo en $0.
          </span>
        </label>
      </Field>

      <Field label="Para confirmar, escribí BORRAR">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="BORRAR"
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 10,
            background: DS.bgCard, color: DS.textPrimary,
            border: `1px solid ${isValid ? DS.red : DS.textHint}`,
            fontFamily: DS.font, fontSize: 13,
            letterSpacing: "0.16em", fontWeight: 700, textTransform: "uppercase",
          }}
        />
      </Field>

      {error && <ErrBox>{error}</ErrBox>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} disabled={busy} style={darkBtnGhost}>Cancelar</button>
        <button
          onClick={submit}
          disabled={busy || !isValid}
          style={{
            ...darkBtn,
            background: isValid ? DS.red : DS.textHint,
            color: "#fff",
            opacity: busy ? 0.5 : 1,
          }}
        >{busy ? "Borrando..." : "Borrar todo"}</button>
      </div>
    </ModalShell>
  );
}
