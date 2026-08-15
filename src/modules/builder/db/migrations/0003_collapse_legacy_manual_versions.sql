DROP TRIGGER IF EXISTS `versions_are_immutable`;--> statement-breakpoint
DROP TABLE IF EXISTS temp.legacy_version_owners;--> statement-breakpoint
CREATE TEMP TABLE legacy_version_owners AS
SELECT
	version.id AS version_id,
	version.chat_id AS chat_id,
	CASE
		WHEN version.source = 'manual' THEN (
			SELECT owner.id
			FROM versions AS owner
			WHERE owner.chat_id = version.chat_id
				AND owner.number < version.number
				AND owner.source <> 'manual'
			ORDER BY owner.number DESC
			LIMIT 1
		)
		ELSE version.id
	END AS owner_id
FROM versions AS version
WHERE EXISTS (
	SELECT 1
	FROM versions AS manual
	WHERE manual.chat_id = version.chat_id
		AND manual.source = 'manual'
);--> statement-breakpoint
DROP TABLE IF EXISTS temp.collapsed_pending_host_sync;--> statement-breakpoint
CREATE TEMP TABLE collapsed_pending_host_sync AS
SELECT
	ownership.owner_id,
	task.article_id,
	(
		SELECT earliest.expected_previous_sha256
		FROM host_sync_outbox AS earliest
		JOIN legacy_version_owners AS earliest_ownership
			ON earliest_ownership.version_id = earliest.version_id
		WHERE earliest_ownership.owner_id = ownership.owner_id
		ORDER BY earliest.version_number
		LIMIT 1
	) AS expected_previous_sha256,
	MAX(task.attempts) AS attempts,
	MIN(task.created_at) AS created_at,
	MAX(task.updated_at) AS updated_at
FROM host_sync_outbox AS task
JOIN legacy_version_owners AS ownership
	ON ownership.version_id = task.version_id
GROUP BY ownership.owner_id, task.article_id;--> statement-breakpoint
UPDATE versions AS owner
SET
	html = (
		SELECT version.html
		FROM versions AS version
		JOIN legacy_version_owners AS ownership
			ON ownership.version_id = version.id
		WHERE ownership.owner_id = owner.id
		ORDER BY version.number DESC
		LIMIT 1
	),
	sha256 = (
		SELECT version.sha256
		FROM versions AS version
		JOIN legacy_version_owners AS ownership
			ON ownership.version_id = version.id
		WHERE ownership.owner_id = owner.id
		ORDER BY version.number DESC
		LIMIT 1
	)
WHERE EXISTS (
	SELECT 1
	FROM legacy_version_owners AS ownership
	WHERE ownership.owner_id = owner.id
		AND ownership.version_id <> owner.id
);--> statement-breakpoint
UPDATE versions AS version
SET
	parent_version_id = COALESCE(
		(
			SELECT ownership.owner_id
			FROM legacy_version_owners AS ownership
			WHERE ownership.version_id = version.parent_version_id
		),
		version.parent_version_id
	),
	restored_from_version_id = COALESCE(
		(
			SELECT ownership.owner_id
			FROM legacy_version_owners AS ownership
			WHERE ownership.version_id = version.restored_from_version_id
		),
		version.restored_from_version_id
	)
WHERE version.chat_id IN (SELECT chat_id FROM legacy_version_owners);--> statement-breakpoint
UPDATE builder_chats AS chat
SET current_version_id = COALESCE(
	(
		SELECT ownership.owner_id
		FROM legacy_version_owners AS ownership
		WHERE ownership.version_id = chat.current_version_id
	),
	chat.current_version_id
)
WHERE chat.id IN (SELECT chat_id FROM legacy_version_owners);--> statement-breakpoint
DELETE FROM host_sync_outbox
WHERE version_id IN (SELECT version_id FROM legacy_version_owners);--> statement-breakpoint
DELETE FROM versions WHERE source = 'manual';--> statement-breakpoint
DELETE FROM messages
WHERE kind = 'source_apply'
	AND chat_id IN (SELECT chat_id FROM legacy_version_owners);--> statement-breakpoint
UPDATE versions AS version
SET number = (
	SELECT COUNT(*)
	FROM versions AS preceding
	WHERE preceding.chat_id = version.chat_id
		AND preceding.number <= version.number
)
WHERE version.chat_id IN (SELECT chat_id FROM legacy_version_owners);--> statement-breakpoint
INSERT INTO host_sync_outbox (
	version_id,
	article_id,
	version_number,
	html,
	sha256,
	expected_previous_sha256,
	attempts,
	last_error,
	created_at,
	updated_at
)
SELECT
	pending.owner_id,
	pending.article_id,
	version.number,
	version.html,
	version.sha256,
	pending.expected_previous_sha256,
	pending.attempts,
	NULL,
	pending.created_at,
	pending.updated_at
FROM collapsed_pending_host_sync AS pending
JOIN versions AS version ON version.id = pending.owner_id;--> statement-breakpoint
DROP TABLE collapsed_pending_host_sync;--> statement-breakpoint
DROP TABLE legacy_version_owners;--> statement-breakpoint
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
