-- Jeux : statuts « Joué » (joué sans être terminé) et « Envies » (pas encore à toi), et le trophée « Masterisé ».
--
-- La liste des statuts est figée par un CHECK de library_entries ; la changer imposerait de reconstruire la table
-- et toutes celles qui la référencent (voir 0013, très coûteux en lectures D1). On ajoute donc seulement des colonnes :
--  - substatus : précise le statut d'un jeu (« played » pour un jeu terminé → Joué, « wishlist » pour un jeu prévu → Envies) ;
--  - list_status : colonne calculée (virtuelle, rien n'est écrit) avec le statut affiché, à utiliser pour les filtres ;
--  - mastered : 🏆 fini à 100 %, indépendant du statut.
-- status garde son sens d'origine pour la progression : un jeu « Joué » est terminé, un jeu « Envies » est prévu.
-- Aucune ligne n'est relue ni réécrite : les colonnes ajoutées sont vides (NULL / 0) pour toutes les entrées.

ALTER TABLE library_entries ADD COLUMN substatus TEXT CHECK (substatus IS NULL OR substatus IN ('played', 'wishlist'));
ALTER TABLE library_entries ADD COLUMN list_status TEXT GENERATED ALWAYS AS (
  CASE
    WHEN status = 'completed' AND substatus = 'played' THEN 'played'
    WHEN status = 'planned' AND substatus = 'wishlist' THEN 'wishlist'
    ELSE status
  END
) VIRTUAL;
ALTER TABLE library_entries ADD COLUMN mastered INTEGER NOT NULL DEFAULT 0 CHECK (mastered IN (0, 1));

-- Un changement de statut fait par la progression (session, « Terminé », annulation…) efface la précision :
-- un jeu « Envies » commencé n'est plus une envie, un jeu « Joué » qu'on termine devient « Terminé ».
-- Un changement fait depuis l'interface écrit status et substatus ensemble : substatus change, rien n'est effacé.
CREATE TRIGGER trg_library_substatus_reset
AFTER UPDATE OF status ON library_entries
WHEN NEW.status IS NOT OLD.status AND NEW.substatus IS NOT NULL AND NEW.substatus IS OLD.substatus
BEGIN
  UPDATE library_entries SET substatus = NULL WHERE id = NEW.id;
END;
