/// <reference path="../../types/worker-configuration.d.ts" />

import { sql } from './utils.ts'

const migrations = [
	{
		version: 1,
		name: 'initial_schema',
		up: async (db: D1Database) => {
			console.log('Starting initial schema migration...')
			try {
				await db.batch([
					db.prepare(sql`
						CREATE TABLE IF NOT EXISTS schema_versions (
							version INTEGER PRIMARY KEY,
							name TEXT NOT NULL,
							applied_at INTEGER DEFAULT (CURRENT_TIMESTAMP) NOT NULL
						);
					`),
					db.prepare(sql`
						CREATE TABLE IF NOT EXISTS users (
							id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
							email text NOT NULL UNIQUE,
							created_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							updated_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL
						);
						CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
					`),
					// This is a mapping of a grant_user_id (accessible via props.grantId)
					// to the user_id that can be used to claim the grant. If user_id is
					// null then it's not yet been claimed. When a user validates their
					// email, we can update the user_id for the grant and find the
					// appropriate user in future requests. and then the client
					// can use that user_id to list and revoke grants (find all grants for
					// a user then list/revoke them).
					db.prepare(sql`
						CREATE TABLE IF NOT EXISTS grants (
							id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
							grant_user_id text NOT NULL,
							user_id integer,
							created_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							updated_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
						);
						CREATE INDEX IF NOT EXISTS idx_grants_user_id ON grants(user_id);
						CREATE INDEX IF NOT EXISTS idx_grants_grant_user_id ON grants(grant_user_id);
					`),
					// An OTP emailed to the user to allow them to claim a grant
					db.prepare(sql`
						CREATE TABLE IF NOT EXISTS validation_tokens (
							id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
							token_value text NOT NULL,
							email text NOT NULL,
							grant_id integer NOT NULL,
							created_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							updated_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							FOREIGN KEY (grant_id) REFERENCES grants(id) ON DELETE CASCADE
						);
						CREATE INDEX IF NOT EXISTS idx_validation_tokens_email ON validation_tokens(email);
						CREATE INDEX IF NOT EXISTS idx_validation_tokens_token ON validation_tokens(token_value);
						CREATE INDEX IF NOT EXISTS idx_validation_tokens_grant ON validation_tokens(grant_id);
					`),
					db.prepare(sql`
						CREATE TABLE IF NOT EXISTS entries (
							id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
							user_id integer NOT NULL,
							title text NOT NULL,
							content text NOT NULL,
							mood text,
							location text,
							weather text,
							is_private integer DEFAULT 1 NOT NULL CHECK (is_private IN (0, 1)),
							is_favorite integer DEFAULT 0 NOT NULL CHECK (is_favorite IN (0, 1)),
							created_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							updated_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
						);
						CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);
						CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
						CREATE INDEX IF NOT EXISTS idx_entries_is_private ON entries(is_private);
					`),
					db.prepare(sql`
						CREATE TABLE IF NOT EXISTS tags (
							id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
							user_id integer NOT NULL,
							name text NOT NULL,
							description text,
							created_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							updated_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
							UNIQUE(user_id, name)
						);
						CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
					`),
					db.prepare(sql`
						CREATE TABLE IF NOT EXISTS entry_tags (
							id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
							user_id integer NOT NULL,
							entry_id integer NOT NULL,
							tag_id integer NOT NULL,
							created_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							updated_at integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
							FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
							FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
							FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
							UNIQUE(entry_id, tag_id)
						);
						CREATE INDEX IF NOT EXISTS idx_entry_tags_user ON entry_tags(user_id);
						CREATE INDEX IF NOT EXISTS idx_entry_tags_entry ON entry_tags(entry_id);
						CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag_id);
					`),
				])
				console.log('Successfully created all tables')
			} catch (error) {
				console.error('Error in initial schema migration:', error)
				throw error
			}
		},
	},
	// Add future migrations here with incrementing version numbers
]

// Run migrations
export async function migrate(db: D1Database) {
	try {
		// Create schema_versions table if it doesn't exist (this is our first run)
		await db.exec(sql`
			CREATE TABLE IF NOT EXISTS schema_versions (
				version INTEGER PRIMARY KEY,
				name TEXT NOT NULL,
				applied_at INTEGER DEFAULT (CURRENT_TIMESTAMP) NOT NULL
			);
		`)

		// Get the current version
		const result = await db
			.prepare(sql`SELECT MAX(version) as version FROM schema_versions;`)
			.first<{ version: number | null }>()

		const currentVersion = result?.version ?? 0
		let migrationCount = 0

		// Run any migrations that haven't been applied yet
		for (const migration of migrations) {
			if (migration.version > currentVersion) {
				console.log(`Running migration ${migration.version}: ${migration.name}`)
				await migration.up(db)
				await db
					.prepare(
						sql`INSERT INTO schema_versions (version, name) VALUES (?, ?);`,
					)
					.bind(migration.version, migration.name)
					.run()
				console.log(`Completed migration ${migration.version}`)
				migrationCount++
			}
		}
		if (migrationCount > 0) {
			console.log(
				`Migration process completed successfully. ${migrationCount} migrations applied.`,
			)
		}
	} catch (error) {
		console.error('Error during migration process:', error)
		throw error
	}
}
