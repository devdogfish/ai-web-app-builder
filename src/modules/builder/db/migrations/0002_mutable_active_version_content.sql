DROP TRIGGER IF EXISTS `versions_are_immutable`;--> statement-breakpoint
CREATE TRIGGER `versions_are_immutable`
BEFORE UPDATE ON `versions`
WHEN OLD.id IS NOT (
	SELECT current_version_id FROM builder_chats WHERE id = OLD.chat_id
)
	OR NEW.id IS NOT OLD.id
	OR NEW.chat_id IS NOT OLD.chat_id
	OR NEW.message_id IS NOT OLD.message_id
	OR NEW.parent_version_id IS NOT OLD.parent_version_id
	OR NEW.restored_from_version_id IS NOT OLD.restored_from_version_id
	OR NEW.number IS NOT OLD.number
	OR NEW.summary IS NOT OLD.summary
	OR NEW.source IS NOT OLD.source
	OR NEW.created_at IS NOT OLD.created_at
BEGIN
	SELECT RAISE(ABORT, 'only active version content is mutable');
END;
