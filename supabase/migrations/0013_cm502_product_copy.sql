-- CM502 — real product description/care copy
--
-- Replaces the seed placeholder text with restrained, factual
-- fashion-commerce copy. Deliberately avoids anything unverifiable:
-- no fabric composition percentages, no official university licensing
-- claims, no technical-fabric or sustainability claims, no rarity/limited
-- edition claims. Generic, conservative garment-care guidance only —
-- no material-specific temperatures, since the real fabric spec hasn't
-- been supplied.
--
-- Plain UPDATE — idempotent, safe to rerun.

update products
set
  description = 'CM502 University Jersey combines a football-inspired silhouette with a clean university look designed for everyday wear. Featuring the CHIANGMAI graphic and bold 88 detailing, the jersey is available in Black, White, Pink, Brown, and Navy.',
  care_info = 'Wash with similar colors using a mild detergent, cold or cool water. Do not bleach. Avoid high heat when drying or ironing. Air dry where possible, and do not iron directly over printed or graphic areas.',
  updated_at = now()
where slug = 'jersey';
