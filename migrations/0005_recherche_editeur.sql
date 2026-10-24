-- Migration 0005 : recherche sans accents + éditeur français des mangas.
--
-- 1. media.search_text : titre et titre original en minuscules, sans accents (« Amélie » -> « amelie »).
--    SQLite ne compare sans tenir compte de la casse que les lettres ASCII (« É » ≠ « é ») ;
--    la recherche de la bibliothèque se fait donc sur cette colonne, calculée par l'application
--    (normalizeSearch dans src/lib/search-text.ts) à chaque ajout ou mise à jour d'une œuvre.
--    Pour les œuvres déjà en base, on la remplit ici avec un équivalent SQL : une table des lettres
--    accentuées courantes, appliquée lettre par lettre (CTE récursive, pour éviter des dizaines de
--    replace() imbriqués). Une écriture par œuvre, une seule fois.
--
-- 2. media.publisher_fr : éditeur français d'un manga, saisi à la main sur la fiche
--    (aucune source fiable ne le fournit par API).

ALTER TABLE media ADD COLUMN search_text TEXT;
ALTER TABLE media ADD COLUMN publisher_fr TEXT;

UPDATE media SET search_text = (
  WITH RECURSIVE
    letters (n, accented, plain) AS (VALUES
      (1, 'à', 'a'), (2, 'á', 'a'), (3, 'â', 'a'), (4, 'ã', 'a'), (5, 'ä', 'a'), (6, 'å', 'a'),
      (7, 'ā', 'a'), (8, 'ă', 'a'), (9, 'ą', 'a'), (10, 'À', 'a'), (11, 'Á', 'a'), (12, 'Â', 'a'),
      (13, 'Ã', 'a'), (14, 'Ä', 'a'), (15, 'Å', 'a'), (16, 'Ā', 'a'), (17, 'Ă', 'a'), (18, 'Ą', 'a'),
      (19, 'ç', 'c'), (20, 'ć', 'c'), (21, 'č', 'c'), (22, 'Ç', 'c'), (23, 'Ć', 'c'), (24, 'Č', 'c'),
      (25, 'è', 'e'), (26, 'é', 'e'), (27, 'ê', 'e'), (28, 'ë', 'e'), (29, 'ē', 'e'), (30, 'ė', 'e'),
      (31, 'ę', 'e'), (32, 'ě', 'e'), (33, 'È', 'e'), (34, 'É', 'e'), (35, 'Ê', 'e'), (36, 'Ë', 'e'),
      (37, 'Ē', 'e'), (38, 'Ė', 'e'), (39, 'Ę', 'e'), (40, 'Ě', 'e'), (41, 'ì', 'i'), (42, 'í', 'i'),
      (43, 'î', 'i'), (44, 'ï', 'i'), (45, 'ī', 'i'), (46, 'į', 'i'), (47, 'Ì', 'i'), (48, 'Í', 'i'),
      (49, 'Î', 'i'), (50, 'Ï', 'i'), (51, 'Ī', 'i'), (52, 'Į', 'i'), (53, 'ñ', 'n'), (54, 'ń', 'n'),
      (55, 'Ñ', 'n'), (56, 'Ń', 'n'), (57, 'ò', 'o'), (58, 'ó', 'o'), (59, 'ô', 'o'), (60, 'õ', 'o'),
      (61, 'ö', 'o'), (62, 'ō', 'o'), (63, 'Ò', 'o'), (64, 'Ó', 'o'), (65, 'Ô', 'o'), (66, 'Õ', 'o'),
      (67, 'Ö', 'o'), (68, 'Ō', 'o'), (69, 'ù', 'u'), (70, 'ú', 'u'), (71, 'û', 'u'), (72, 'ü', 'u'),
      (73, 'ū', 'u'), (74, 'ů', 'u'), (75, 'Ù', 'u'), (76, 'Ú', 'u'), (77, 'Û', 'u'), (78, 'Ü', 'u'),
      (79, 'Ū', 'u'), (80, 'Ů', 'u'), (81, 'ý', 'y'), (82, 'ÿ', 'y'), (83, 'Ý', 'y'), (84, 'Ÿ', 'y'),
      (85, 'š', 's'), (86, 'ś', 's'), (87, 'Š', 's'), (88, 'Ś', 's'), (89, 'ž', 'z'), (90, 'ź', 'z'),
      (91, 'ż', 'z'), (92, 'Ž', 'z'), (93, 'Ź', 'z'), (94, 'Ż', 'z'), (95, 'œ', 'oe'), (96, 'Œ', 'oe'),
      (97, 'æ', 'ae'), (98, 'Æ', 'ae'), (99, 'ß', 'ss'), (100, '’', ''''), (101, '‘', ''''), (102, '`', ''''),
      (103, '´', '''')),
    step (n, text) AS (
      SELECT 0, lower(TRIM(media.title || ' ' || COALESCE(media.original_title, '')))
      UNION ALL
      SELECT step.n + 1, replace(step.text, letters.accented, letters.plain)
      FROM step JOIN letters ON letters.n = step.n + 1
    )
  SELECT text FROM step ORDER BY n DESC LIMIT 1
);
