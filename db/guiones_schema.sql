-- ============================================================
-- Guiones Module — Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Formatos de contenido (dinámicos, crecen con el tiempo)
CREATE TABLE script_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  structure TEXT,
  examples JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Perfil de voz global (1 registro, se actualiza)
CREATE TABLE voice_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patterns TEXT NOT NULL DEFAULT '',
  phrases TEXT DEFAULT '',
  never_say TEXT DEFAULT '',
  tone_notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Base de expertise (1 registro, se actualiza)
CREATE TABLE expertise_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_ads TEXT DEFAULT '',
  ecommerce TEXT DEFAULT '',
  business TEXT DEFAULT '',
  stories TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Guiones generados
CREATE TABLE scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  format_id UUID REFERENCES script_formats(id) ON DELETE SET NULL,
  reference_text TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  generated_content TEXT DEFAULT '',
  final_content TEXT DEFAULT '',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  feedback TEXT DEFAULT '',
  chat_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS permissive (same pattern as team module)
ALTER TABLE script_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE expertise_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_script_formats" ON script_formats FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_voice_profile" ON voice_profile FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_expertise_base" ON expertise_base FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_scripts" ON scripts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime for scripts and formats
ALTER PUBLICATION supabase_realtime ADD TABLE scripts;
ALTER PUBLICATION supabase_realtime ADD TABLE script_formats;

-- Seed: create empty voice_profile and expertise_base rows
INSERT INTO voice_profile (patterns) VALUES ('');
INSERT INTO expertise_base DEFAULT VALUES;
