-- finance_paid_amount.sql
-- Agrega paid_amount a finance_transactions para soportar pagos parciales.
-- Antes: cada transaction era todo-o-nada (status=completed → pagado, else → 0).
-- Después: paid_amount independiente de amount, permite "$3.5M recibido de $4.5M total"
-- en una sola fila (caso Asesorías de Jose) o "$500k pagado de $1M" en gastos.
--
-- Idempotente. Re-correr no rompe nada.

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC NOT NULL DEFAULT 0;

-- Backfill: las transactions que YA estaban completed tenían paid_amount=0 por
-- el default. Las ponemos en paid_amount=amount para reflejar realidad.
UPDATE public.finance_transactions
  SET paid_amount = amount
  WHERE status = 'completed' AND paid_amount = 0;

-- Refresca el schema cache de PostgREST para que la API vea la columna nueva
-- inmediatamente (sin esperar al refresh automático).
NOTIFY pgrst, 'reload schema';
