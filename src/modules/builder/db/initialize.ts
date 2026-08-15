import type Database from "better-sqlite3";

/**
 * Local zero-config bootstrap. Drizzle migrations remain the production path;
 * this DDL intentionally mirrors schema.ts so a fresh local database just works.
 */
export function initializeDatabase(sqlite: Database.Database): void {
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY NOT NULL,
      website TEXT NOT NULL,
      article_type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS articles_website_idx ON articles (website);

    CREATE TABLE IF NOT EXISTS article_images (
      id TEXT PRIMARY KEY NOT NULL,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position > 0),
      original_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
      bytes BLOB NOT NULL,
      needs_upload INTEGER NOT NULL DEFAULT 1
        CHECK (needs_upload IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS article_images_article_position_unique
      ON article_images (article_id, position);
    CREATE INDEX IF NOT EXISTS article_images_article_upload_idx
      ON article_images (article_id, needs_upload);

    CREATE TABLE IF NOT EXISTS builder_chats (
      id TEXT PRIMARY KEY NOT NULL,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      current_version_id TEXT,
      compact_memory TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS builder_chats_article_unique
      ON builder_chats (article_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      chat_id TEXT NOT NULL REFERENCES builder_chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      kind TEXT NOT NULL DEFAULT 'chat'
        CHECK (kind IN ('chat', 'source_apply', 'rewind', 'baseline')),
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'complete'
        CHECK (status IN ('complete', 'failed', 'stopped')),
      error_code TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_chat_created_idx
      ON messages (chat_id, created_at);

    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY NOT NULL,
      chat_id TEXT NOT NULL REFERENCES builder_chats(id) ON DELETE CASCADE,
      message_id TEXT,
      parent_version_id TEXT,
      restored_from_version_id TEXT,
      number INTEGER NOT NULL,
      html TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL
        CHECK (source IN ('baseline', 'assistant', 'manual', 'rewind')),
      sha256 TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS versions_chat_number_unique
      ON versions (chat_id, number);
    CREATE INDEX IF NOT EXISTS versions_chat_created_idx
      ON versions (chat_id, created_at);
    CREATE INDEX IF NOT EXISTS versions_message_idx ON versions (message_id);

    CREATE TABLE IF NOT EXISTS host_sync_outbox (
      version_id TEXT PRIMARY KEY NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      html TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      expected_previous_sha256 TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS host_sync_outbox_article_version_idx
      ON host_sync_outbox (article_id, version_number);

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY NOT NULL,
      chat_id TEXT NOT NULL REFERENCES builder_chats(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      storage_key TEXT NOT NULL,
      extracted_text TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS uploads_chat_created_idx
      ON uploads (chat_id, created_at);
    CREATE INDEX IF NOT EXISTS uploads_message_idx ON uploads (message_id);

    DROP TRIGGER IF EXISTS versions_are_immutable;

    DROP TABLE IF EXISTS temp.legacy_version_owners;
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
    );

    DROP TABLE IF EXISTS temp.collapsed_pending_host_sync;
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
    GROUP BY ownership.owner_id, task.article_id;

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
    );

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
    WHERE version.chat_id IN (SELECT chat_id FROM legacy_version_owners);

    UPDATE builder_chats AS chat
    SET current_version_id = COALESCE(
      (
        SELECT ownership.owner_id
        FROM legacy_version_owners AS ownership
        WHERE ownership.version_id = chat.current_version_id
      ),
      chat.current_version_id
    )
    WHERE chat.id IN (SELECT chat_id FROM legacy_version_owners);

    DELETE FROM host_sync_outbox
    WHERE version_id IN (SELECT version_id FROM legacy_version_owners);

    DELETE FROM versions WHERE source = 'manual';

    DELETE FROM messages
    WHERE kind = 'source_apply'
      AND chat_id IN (SELECT chat_id FROM legacy_version_owners);

    UPDATE versions AS version
    SET number = (
      SELECT COUNT(*)
      FROM versions AS preceding
      WHERE preceding.chat_id = version.chat_id
        AND preceding.number <= version.number
    )
    WHERE version.chat_id IN (SELECT chat_id FROM legacy_version_owners);

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
    JOIN versions AS version ON version.id = pending.owner_id;

    DROP TABLE collapsed_pending_host_sync;
    DROP TABLE legacy_version_owners;

    CREATE TRIGGER versions_are_immutable
    BEFORE UPDATE ON versions
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
  `);

  const messageColumns = sqlite.pragma("table_info(messages)") as Array<{
    name: string;
  }>;
  if (!messageColumns.some((column) => column.name === "error_code")) {
    sqlite.exec("ALTER TABLE messages ADD COLUMN error_code TEXT;");
  }
}
