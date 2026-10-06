-- The "Why I picked it" note was removed from items; clear any stored notes.
UPDATE entities SET data = json_remove(data, '$.note') WHERE type = 'item' AND json_extract(data, '$.note') IS NOT NULL;
