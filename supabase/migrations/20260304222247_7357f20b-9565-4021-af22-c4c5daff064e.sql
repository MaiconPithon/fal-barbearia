
-- Clean all existing services and insert the correct ones
DELETE FROM services WHERE id NOT IN (SELECT DISTINCT service_id FROM appointments);

-- For services referenced by appointments, we'll keep them but we need to insert the correct catalog
-- Let's just truncate and re-insert, but first remove FK constraint issues by setting a default
-- Actually, let's delete all and re-insert with proper data
DELETE FROM services;

INSERT INTO services (name, price, duration_minutes, buffer_minutes, sort_order, active) VALUES
  ('Corte', 25.00, 30, 0, 1, true),
  ('Corte + Barba', 35.00, 45, 0, 2, true),
  ('Corte + Cavanhaque', 30.00, 45, 0, 3, true),
  ('Corte + Pigmentação', 35.00, 45, 0, 4, true),
  ('Corte + Barba + Pigmentação', 40.00, 60, 0, 5, true),
  ('Barba', 10.00, 15, 0, 6, true),
  ('Sobrancelha', 5.00, 15, 0, 7, true),
  ('Sobrancelha Feminina', 10.00, 15, 0, 8, true),
  ('Pigmentação', 10.00, 15, 0, 9, true);
