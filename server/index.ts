// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import express, { type Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { setupTelegramBot } from "./telegram";
import { storage } from "./storage";
import { runAutoSignalGenerator } from "./signals-worker";
import { restoreFromSupabase, backupToSupabase } from "./restore";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { fileURLToPath } from "url";

// Create __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source: string = "express") {
  if (message.includes("Restored item for table group_bindings")) return;
  if (message.includes("Backing up") && message.includes("records to Supabase")) return;
  if (message.includes("Restored/Updated")) return;
  if (message.includes("Found") && message.includes("records in")) return;
  if (message.includes("No records found in")) return;
  if (message.includes("INITIAL SCAN TRIGGERED")) return;
  if (message.includes("INITIAL MONITORING TRIGGERED")) return;
  if (message.includes("SMC Worker AI initialized")) return;
  if (message.includes("Initializing AI with keys present")) return;
  if (message.includes("PostgreSQL connection successful")) return;
  if (message.includes("Telegram bot setup complete")) return;
  if (message.includes("serving on port 5000")) return;
  if (message.includes("Starting institutional SMC signal generator")) return;
  if (message.includes("Initializing Telegram bot")) return;
  if (message.includes("Received message from")) return;
  const time = new Date().toLocaleTimeString('en-US', { 
    hour12: true, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  if (message.includes("SMC Worker AI environment variables missing")) return;
  console.log(`${time} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      log(`${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

if (!process.env.SKIP_SERVER_START) {
  (async () => {
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      res.status(status).json({ message: err.message || "Internal Server Error" });
    });

    try {
      const shutdown = async () => {
        log("Shutting down gracefully...", "server");
        const { getTelegramBot } = await import("./telegram");
        const bot = getTelegramBot();
        if (bot) {
          log("Stopping Telegram bot polling...", "telegram");
          bot.stopPolling();
        }
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      runAutoSignalGenerator().catch(err => log(`Signal generator error: ${err instanceof Error ? err.message : String(err)}`, "worker"));

      const server = createServer(app);
      
      server.listen(5000, "0.0.0.0", async () => {
        log("serving on port 5000");
        
        const distPath = path.resolve(process.cwd(), "client", "dist");
        if (fs.existsSync(distPath)) {
          app.use(express.static(distPath));
          app.get("*", (_req, res) => {
            res.sendFile(path.resolve(distPath, "index.html"));
          });
        }

        if (!process.env.SESSION_SECRET) {
          log("CRITICAL: SESSION_SECRET is not set. Wallet encryption will fail!", "security");
        }

        try {
          log("Using SQLite (file:local.db) as primary database.", "db");

          log("Running database migrations...", "db");
          try {
            // Resolve migrations relative to this file location (server directory)
            const migrationsDir = path.resolve(__dirname, "../migrations");
            if (fs.existsSync(migrationsDir)) {
              // Read all .sql files and sort them to ensure proper ordering
              const migrationFiles = fs.readdirSync(migrationsDir)
                .filter(f => f.endsWith('.sql'))
                .sort(); // Numeric prefix ordering: 001_..., 002_..., setup.sql

              for (const file of migrationFiles) {
                const filePath = path.join(migrationsDir, file);
                try {
                  const sqlContent = fs.readFileSync(filePath, "utf-8");
                  // Split by semicolon, remove comments and empty statements
                  const rawStatements = sqlContent.split(";");
                  const statements = rawStatements
                    .map(s => s.trim())
                    .filter(s => s && !s.startsWith("--")); // Remove comments and empty lines
                  
                  log(`[${file}] Found ${statements.length} statements to execute`, "db");
                  
                  let successCount = 0;
                  for (const stmt of statements) {
                    if (stmt.trim()) {
                      try {
                        await db.run(sql.raw(stmt));
                        successCount++;
                      } catch (migrateErr: any) {
                        const errMsg = migrateErr.message || String(migrateErr);
                        // Ignore "column already exists" errors - they're expected for idempotent migrations
                        if (errMsg.includes("duplicate column name") || errMsg.includes("already exists")) {
                          log(`Already exists (safe to ignore): ${stmt.slice(0, 50)}...`, "db");
                          successCount++;
                        } else if (errMsg.includes("no such table")) {
                          log(`Table doesn't exist yet (safe to ignore): ${stmt.slice(0, 50)}...`, "db");
                          successCount++;
                        } else {
                          log(`Migration statement failed: ${stmt.slice(0, 80)}...`, "db");
                          log(`Full error: ${errMsg}`, "db");
                          throw migrateErr; // Re-throw unexpected errors
                        }
                      }
                    }
                  }
                  log(`Migration complete: ${file} (${successCount}/${statements.length} statements)`, "db");
                } catch (fileErr) {
                  log(`Error running migration ${file}: ${fileErr}`, "db");
                  throw fileErr;
                }
              }
              log(`All migrations complete (${migrationFiles.length} files processed).`, "db");
            } else {
              log("Migrations directory not found, skipping migrations", "db");
            }

            // Seed owner into admins table if missing
            try {
              const OWNER_ID = process.env.OWNER_ID || '6491714705';
              await storage.addAdmin(OWNER_ID, true);
              log(`Owner ${OWNER_ID} seeded into admins table.`, "db");
            } catch (e: any) {
              log(`Failed to seed owner admin: ${e instanceof Error ? e.message : String(e)}`, "db");
            }
          } catch (err) {
            log(`Migration error: ${err instanceof Error ? err.message : String(err)}`, "db");
          }

          const { isBackupEnabled } = await import('./db');
          if (isBackupEnabled && process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
            await restoreFromSupabase();
            setInterval(() => {
              backupToSupabase().catch(err => log(`Scheduled backup failed: ${err instanceof Error ? err.message : String(err)}`, "backup"));
            }, 30 * 60 * 1000);
          } else {
            log("Backup disabled or Supabase credentials missing, skipping restore/backup", "backup");
          }
        } catch (e) {
          log(`Database connection/restoration failed: ${e instanceof Error ? e.message : String(e)}`, "db");
        }
        if (process.env.TELEGRAM_BOT_TOKEN) {
          setupTelegramBot();
        }
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          log("Port 5000 is already in use. This is expected if Vite is running on the same port in dev mode.", "server");
        } else {
          log(`Server error: ${err.message}`, "server");
        }
      });
    } catch (e) {
       log(`Server startup error: ${e instanceof Error ? e.message : String(e)}`, "server");
    }
  })();
}
