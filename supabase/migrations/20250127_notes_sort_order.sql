-- Add sort_order to notes and folders for drag-and-drop reordering
-- Notes and folders within the same parent can be reordered by the user

-- Add sort_order to notes
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add sort_order to folders
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Create indexes for efficient ordering queries
CREATE INDEX IF NOT EXISTS idx_notes_sort_order
  ON notes(user_id, folder_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_folders_sort_order
  ON folders(user_id, parent_id, sort_order);

-- Initialize sort_order based on updated_at (most recent first = lower number)
UPDATE notes
SET sort_order = subq.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, folder_id
    ORDER BY updated_at DESC
  ) as row_num
  FROM notes
) subq
WHERE notes.id = subq.id;

UPDATE folders
SET sort_order = subq.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, parent_id
    ORDER BY name ASC
  ) as row_num
  FROM folders
) subq
WHERE folders.id = subq.id;

-- Function to reorder items within a folder/parent
CREATE OR REPLACE FUNCTION reorder_notes_in_folder(
  p_note_id UUID,
  p_new_position INTEGER,
  p_folder_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_old_position INTEGER;
BEGIN
  -- Get current note info
  SELECT user_id, sort_order INTO v_user_id, v_old_position
  FROM notes WHERE id = p_note_id;

  IF v_old_position = p_new_position THEN
    RETURN; -- No change needed
  END IF;

  -- Shift other notes to make room
  IF p_new_position < v_old_position THEN
    -- Moving up: increment sort_order for notes between new and old position
    UPDATE notes
    SET sort_order = sort_order + 1
    WHERE user_id = v_user_id
      AND folder_id IS NOT DISTINCT FROM p_folder_id
      AND sort_order >= p_new_position
      AND sort_order < v_old_position
      AND id != p_note_id;
  ELSE
    -- Moving down: decrement sort_order for notes between old and new position
    UPDATE notes
    SET sort_order = sort_order - 1
    WHERE user_id = v_user_id
      AND folder_id IS NOT DISTINCT FROM p_folder_id
      AND sort_order > v_old_position
      AND sort_order <= p_new_position
      AND id != p_note_id;
  END IF;

  -- Set the note to its new position
  UPDATE notes
  SET sort_order = p_new_position
  WHERE id = p_note_id;
END;
$$;

CREATE OR REPLACE FUNCTION reorder_folders_in_parent(
  p_folder_id UUID,
  p_new_position INTEGER,
  p_parent_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_old_position INTEGER;
BEGIN
  -- Get current folder info
  SELECT user_id, sort_order INTO v_user_id, v_old_position
  FROM folders WHERE id = p_folder_id;

  IF v_old_position = p_new_position THEN
    RETURN;
  END IF;

  -- Shift other folders
  IF p_new_position < v_old_position THEN
    UPDATE folders
    SET sort_order = sort_order + 1
    WHERE user_id = v_user_id
      AND parent_id IS NOT DISTINCT FROM p_parent_id
      AND sort_order >= p_new_position
      AND sort_order < v_old_position
      AND id != p_folder_id;
  ELSE
    UPDATE folders
    SET sort_order = sort_order - 1
    WHERE user_id = v_user_id
      AND parent_id IS NOT DISTINCT FROM p_parent_id
      AND sort_order > v_old_position
      AND sort_order <= p_new_position
      AND id != p_folder_id;
  END IF;

  UPDATE folders
  SET sort_order = p_new_position
  WHERE id = p_folder_id;
END;
$$;

COMMENT ON COLUMN notes.sort_order IS 'Position within folder for user-defined ordering (lower = higher in list)';
COMMENT ON COLUMN folders.sort_order IS 'Position within parent folder for user-defined ordering';
