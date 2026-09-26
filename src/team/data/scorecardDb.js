import { database } from "../../lib/backend.js";

// ---- KPIs ----
export async function listKpis(memberId) {
  return database
    .from("scorecard_kpis")
    .select("*")
    .eq("member_id", memberId)
    .eq("archived", false)
    .order("sort_order", { ascending: true });
}

export async function createKpi(payload) {
  return database
    .from("scorecard_kpis")
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();
}

export async function updateKpi(id, patch) {
  return database
    .from("scorecard_kpis")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
}

export async function archiveKpi(id) {
  return database
    .from("scorecard_kpis")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", id);
}

// ---- Entries ----
// Returns entries for a member in a date range (inclusive)
export async function listEntries(memberId, fromDate, toDate) {
  return database
    .from("scorecard_entries")
    .select("*")
    .eq("member_id", memberId)
    .gte("date", fromDate)
    .lte("date", toDate);
}

// Upsert one entry (kpi+date is unique).
// value: 'si' | 'no' | null (null borra la entrada)
export async function upsertEntry({ kpi_id, member_id, date, value }) {
  if (value === null || value === undefined) {
    return database
      .from("scorecard_entries")
      .delete()
      .eq("kpi_id", kpi_id)
      .eq("date", date);
  }
  return database
    .from("scorecard_entries")
    .upsert(
      {
        kpi_id,
        member_id,
        date,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kpi_id,date" }
    )
    .select()
    .single();
}

// ---- Notes ----
export async function listNotes(memberId, fromDate, toDate) {
  return database
    .from("scorecard_notes")
    .select("*")
    .eq("member_id", memberId)
    .gte("date", fromDate)
    .lte("date", toDate);
}

export async function upsertNote({ member_id, date, note }) {
  return database
    .from("scorecard_notes")
    .upsert(
      {
        member_id,
        date,
        note: note || "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id,date" }
    )
    .select()
    .single();
}
