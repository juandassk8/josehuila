-- Miembros del equipo de cada empresa. No es la misma tabla que el "team"
-- interno de Inforce (team_schema.sql), que es el equipo de Jose. Aquí va
-- el equipo DEL CLIENTE: copywriter, editor, content (UGCs), etc.
--
-- Un miembro puede cumplir múltiples roles (campo `roles` como array).
-- `is_owner` marca al dueño. `is_ugc_pool` permite representar un pool de
-- UGCs (no una persona nombrada) — en ese caso `name` es descriptivo ("UGCs
-- externos") y no una persona individual.

CREATE TABLE IF NOT EXISTS company_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- companies.id es TEXT legacy (timestamp como string), por eso FK débil sin REFERENCES.
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  is_ugc_pool BOOLEAN NOT NULL DEFAULT false,
  roles TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  avatar_color TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_team_members_company
  ON company_team_members (company_id);

ALTER TABLE company_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read company_team_members" ON company_team_members;
CREATE POLICY "read company_team_members" ON company_team_members
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "write company_team_members" ON company_team_members;
CREATE POLICY "write company_team_members" ON company_team_members
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_company_team_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_team_members_updated_at ON company_team_members;
CREATE TRIGGER trg_company_team_members_updated_at
  BEFORE UPDATE ON company_team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_company_team_members_updated_at();
