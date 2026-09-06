-- Character drafts predate the editable Attribute vocabulary. Preserve their
-- values while replacing raw built-in labels with stable core Model keys.
UPDATE "CampaignInstanceCharacterDraft"
SET "attributeAssignments" =
  ("attributeAssignments" - ARRAY[
    'might', 'intellect', 'will', 'wisdom', 'hardiness', 'charisma', 'agility', 'fortune', 'sanity'
  ]) || jsonb_strip_nulls(jsonb_build_object(
    'aow:attribute-might', COALESCE("attributeAssignments" -> 'aow:attribute-might', "attributeAssignments" -> 'might'),
    'aow:attribute-intellect', COALESCE("attributeAssignments" -> 'aow:attribute-intellect', "attributeAssignments" -> 'intellect'),
    'aow:attribute-wisdom', COALESCE("attributeAssignments" -> 'aow:attribute-wisdom', "attributeAssignments" -> 'wisdom', "attributeAssignments" -> 'will'),
    'aow:attribute-hardiness', COALESCE("attributeAssignments" -> 'aow:attribute-hardiness', "attributeAssignments" -> 'hardiness'),
    'aow:attribute-charisma', COALESCE("attributeAssignments" -> 'aow:attribute-charisma', "attributeAssignments" -> 'charisma'),
    'aow:attribute-agility', COALESCE("attributeAssignments" -> 'aow:attribute-agility', "attributeAssignments" -> 'agility'),
    'aow:attribute-fortune', COALESCE("attributeAssignments" -> 'aow:attribute-fortune', "attributeAssignments" -> 'fortune'),
    'aow:attribute-sanity', COALESCE("attributeAssignments" -> 'aow:attribute-sanity', "attributeAssignments" -> 'sanity')
  ))
WHERE jsonb_typeof("attributeAssignments") = 'object'
  AND "attributeAssignments" ?| ARRAY[
    'might', 'intellect', 'will', 'wisdom', 'hardiness', 'charisma', 'agility', 'fortune', 'sanity'
  ];

-- Retained legacy drafts are migration/archive input only, but normalizing them
-- keeps one-way materialization deterministic until that table is removed.
UPDATE "CharacterCreationDraft"
SET "attributeAssignments" =
  ("attributeAssignments" - ARRAY[
    'might', 'intellect', 'will', 'wisdom', 'hardiness', 'charisma', 'agility', 'fortune', 'sanity'
  ]) || jsonb_strip_nulls(jsonb_build_object(
    'aow:attribute-might', COALESCE("attributeAssignments" -> 'aow:attribute-might', "attributeAssignments" -> 'might'),
    'aow:attribute-intellect', COALESCE("attributeAssignments" -> 'aow:attribute-intellect', "attributeAssignments" -> 'intellect'),
    'aow:attribute-wisdom', COALESCE("attributeAssignments" -> 'aow:attribute-wisdom', "attributeAssignments" -> 'wisdom', "attributeAssignments" -> 'will'),
    'aow:attribute-hardiness', COALESCE("attributeAssignments" -> 'aow:attribute-hardiness', "attributeAssignments" -> 'hardiness'),
    'aow:attribute-charisma', COALESCE("attributeAssignments" -> 'aow:attribute-charisma', "attributeAssignments" -> 'charisma'),
    'aow:attribute-agility', COALESCE("attributeAssignments" -> 'aow:attribute-agility', "attributeAssignments" -> 'agility'),
    'aow:attribute-fortune', COALESCE("attributeAssignments" -> 'aow:attribute-fortune', "attributeAssignments" -> 'fortune'),
    'aow:attribute-sanity', COALESCE("attributeAssignments" -> 'aow:attribute-sanity', "attributeAssignments" -> 'sanity')
  ))
WHERE jsonb_typeof("attributeAssignments") = 'object'
  AND "attributeAssignments" ?| ARRAY[
    'might', 'intellect', 'will', 'wisdom', 'hardiness', 'charisma', 'agility', 'fortune', 'sanity'
  ];
