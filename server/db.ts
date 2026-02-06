import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../shared/schema";
import { sql } from "drizzle-orm";
import path from "path";
import { fileURLToPath } from "url";

// Backup is disabled as bot should rely solely on local.db
export const isBackupEnabled = false;

// Create __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve database path relative to this file location
const dbPath = path.resolve(__dirname, "../local.db");
const client = createClient({
	url: process.env.DATABASE_URL || process.env.SQLITE_DB_URL || `file:${dbPath}`,
});

// Export the resolved DB path for debugging and log it on import
export const DB_PATH = dbPath;
console.log(`[db] Resolved SQLite path: ${DB_PATH}`);

export const db = drizzle(client, { schema });

export const pool = { 
	query: async (text: string, params: any[]) => {
		try {
			if (text.toLowerCase().startsWith('select')) {
				const result = await db.run(sql.raw(text));
				return { rows: (result as any).rows || [] };
			}
			return { rows: [] };
		} catch (e) {
			console.error("Pool query error:", e);
			return { rows: [] };
		}
	}
} as any;
