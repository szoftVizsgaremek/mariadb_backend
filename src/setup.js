import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mariadb from "mariadb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../ticket.sql");

const host = process.env.DB_HOST || "localhost";
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || "root";
const password = process.env.DB_PASSWORD || "";
const database = process.env.DB_NAME || "ticket_db";

// Connect without selecting a database — ticket.sql creates it.
const conn = await mariadb.createConnection({
  host,
  port,
  user,
  password,
  multipleStatements: true,
  bigIntAsNumber: true,
});

const sql = fs.readFileSync(schemaPath, "utf8");

console.log(`Importing ${schemaPath} (database: ${database})...`);
await conn.query(sql);
console.log("Database ready.");

await conn.end();