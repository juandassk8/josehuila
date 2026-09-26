-- Campos extra del perfil del miembro del equipo: bio, teléfono, cumpleaños.
-- accent_color ya existe como avatar_color.
ALTER TABLE company_team_members
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS birthday_day INT CHECK (birthday_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS birthday_month INT CHECK (birthday_month BETWEEN 1 AND 12);
