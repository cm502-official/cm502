-- CM502 — fix: shipping_methods had no unique constraint, so seed.sql's
-- `on conflict do nothing` had no conflict target to match and could
-- silently insert duplicate shipping methods on every reseed. Add a real
-- uniqueness guarantee on the human-readable name so upserts/reseeds are
-- safe. Additive only — no data loss, no table recreation.

alter table shipping_methods
  add constraint uniq_shipping_methods_name unique (name);
