-- Agrega columna email a companies para login cliente con correo + password.
-- El password existente (campo `pin`) se reutiliza como contraseña.
--
-- Correr en Supabase: Dashboard → SQL Editor → pegar y ejecutar.
-- Es idempotente: seguro de correr múltiples veces.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS email TEXT;

-- Normaliza: sin espacios, minúsculas.
CREATE INDEX IF NOT EXISTS idx_companies_email ON companies (lower(email));

-- Opcional: marcar unique para evitar que dos empresas compartan correo.
-- Descomenta solo si estás seguro de que cada empresa tiene correo distinto.
-- ALTER TABLE companies ADD CONSTRAINT companies_email_unique UNIQUE (lower(email));
