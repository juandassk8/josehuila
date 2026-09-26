import { createContext, useContext } from "react";

// Context del módulo Guiones — expone companyId y memberId del usuario logueado.
// El value puede ser:
//   - string companyId (forma legacy)
//   - { companyId, memberId } (forma nueva, para auditoría de tokens por persona)
// Los hooks adaptan ambas.
export const CompanyGuionesContext = createContext(null);

function unwrap(ctx) {
  if (ctx == null) return { companyId: null, memberId: null };
  if (typeof ctx === "string") return { companyId: ctx, memberId: null };
  return { companyId: ctx.companyId || null, memberId: ctx.memberId || null };
}

export function useCompanyId() {
  return unwrap(useContext(CompanyGuionesContext)).companyId;
}

export function useCurrentMemberId() {
  return unwrap(useContext(CompanyGuionesContext)).memberId;
}
