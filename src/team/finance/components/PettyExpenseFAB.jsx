// FAB para gastos hormiga. Posicionado a la izquierda del voice FAB.

import { useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { PettyExpenseModal } from "../modals/PettyExpenseModal.jsx";

export function PettyExpenseFAB({ finance }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Registrar gasto hormiga (rápido)"
        style={{
          position: "fixed",
          bottom: 96,
          right: 100, // a la izquierda del voice FAB
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          background: "#F59E0B",
          color: "#fff",
          fontSize: 22,
          cursor: "pointer",
          boxShadow: `0 0 0 4px ${withAlpha("#F59E0B", "33")}, 0 6px 18px rgba(0,0,0,0.4)`,
          zIndex: 9000,
          fontFamily: DS.font,
        }}
      >🐜</button>
      {open && <PettyExpenseModal finance={finance} onClose={() => setOpen(false)} />}
    </>
  );
}
