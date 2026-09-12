import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

import { query } from "./db.js";

const app = express();
const PORT = process.env.PORT || 8080;
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || "uploads");
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const EXTRA_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const emailFrom = process.env.EMAIL_FROM || smtpUser || "noreply@localhost";

const mailer = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    })
  : null;

async function sendMail({ to, subject, text }) {
  if (mailer) {
    await mailer.sendMail({ from: emailFrom, to, subject, text });
  } else {
    console.log(`[email] To: ${to}\nSubject: ${subject}\n${text}\n`);
  }
}

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// In-memory session store (token -> userId).
const sessions = new Map();

app.set("trust proxy", 1);
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed =
        !origin ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        EXTRA_ORIGINS.includes(origin);
      callback(null, allowed);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(UPLOADS_DIR));

// ---------------------------------------------------------------- Helpers

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}

function toISO(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    birthDate: toDate(row.birth_date),
  };
}

function mapTicket(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    type: row.type,
    uploadedBy: row.uploaded_by,
    assigneeId: row.assignee_id,
    createdAt: toISO(row.created_at),
    updatedAt: toISO(row.updated_at),
  };
}

async function attachPeople(tickets) {
  const rows = await query("SELECT * FROM users");
  const byId = new Map(rows.map((u) => [u.id, u]));

  return tickets.map((t) => ({
    ...t,
    reporter: publicUser(byId.get(t.uploadedBy) ?? null),
    assignee: publicUser(byId.get(t.assigneeId) ?? null),
  }));
}

function setSession(res, userId) {
  const token = crypto.randomUUID();
  sessions.set(token, userId);
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: 60 * 60 * 24 * 7,
  });
}

function clearSession(res) {
  res.clearCookie("session");
}

async function authenticate(req) {
  const token = req.cookies?.session;

  if (!token || !sessions.has(token)) {
    return null;
  }

  const userId = sessions.get(token);
  const [user] = await query("SELECT * FROM users WHERE id = ?", [userId]);

  if (!user) {
    sessions.delete(token);
    return null;
  }

  return user;
}

function requireAuth(handler) {
  return async (req, res) => {
    const user = await authenticate(req);

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    return handler(req, res, user);
  };
}

function requireRole(...roles) {
  return (handler) =>
    requireAuth(async (req, res, user) => {
      if (!roles.includes(user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      return handler(req, res, user);
    });
}

// ---------------------------------------------------------------- Auth

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  const [user] = await query(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );

  const valid = user && (await bcrypt.compare(password ?? "", user.hash));

  if (!valid) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  setSession(res, user.id);
  return res.json(publicUser(user));
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body ?? {};

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const [user] = await query("SELECT * FROM users WHERE email = ?", [email]);

  // Always respond the same way to avoid leaking which emails exist.
  if (!user) {
    return res.json({ message: "If that email exists, we sent a reset link." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query(
    "INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)",
    [user.id, token, expires]
  );

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;

  await sendMail({
    to: user.email,
    subject: "Reset your Ticket System password",
    text:
      `Hi ${user.name},\n\n` +
      `We received a request to reset your password. ` +
      `Click the link below to choose a new one (valid for 1 hour):\n\n` +
      `${resetUrl}\n\n` +
      `If you didn't request this, you can ignore this email.`,
  });

  return res.json({ message: "If that email exists, we sent a reset link." });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password } = req.body ?? {};

  if (!token || !password) {
    return res.status(400).json({ message: "Token and password are required" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }

  const [reset] = await query(
    "SELECT * FROM password_resets WHERE token = ? AND used = 0",
    [token]
  );

  if (!reset) {
    return res.status(400).json({ message: "Invalid or expired reset token" });
  }

  if (new Date(reset.expires_at) < new Date()) {
    return res.status(400).json({ message: "Invalid or expired reset token" });
  }

  const hash = await bcrypt.hash(password, 12);

  await query("UPDATE users SET hash = ? WHERE id = ?", [hash, reset.user_id]);
  await query("UPDATE password_resets SET used = 1 WHERE id = ?", [reset.id]);

  // Invalidate existing sessions for this user.
  for (const [token, userId] of sessions.entries()) {
    if (userId === reset.user_id) {
      sessions.delete(token);
    }
  }

  return res.json({ message: "Password has been reset. You can now sign in." });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies?.session;
  if (token) {
    sessions.delete(token);
  }
  clearSession(res);
  return res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth(async (req, res, user) => {
  return res.json(publicUser(user));
}));

// ---------------------------------------------------------------- Users

app.get("/api/users", requireAuth(async (req, res) => {
  const rows = await query("SELECT * FROM users ORDER BY name");
  return res.json(rows.map(publicUser));
}));

app.post("/api/users", requireRole("admin")(async (req, res) => {
  const {
    name,
    username,
    email,
    password,
    role = "user",
    birthDate = null,
  } = req.body ?? {};

  if (!name || !username || !email || !password) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }

  if (!["user", "area_manager", "admin"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    const result = await query(
      `INSERT INTO users (name, username, hash, birth_date, role, email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, username, hash, birthDate, role, email]
    );

    const [user] = await query("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);

    return res.status(201).json(publicUser(user));
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Username or email already exists" });
    }
    throw error;
  }
}));

app.get("/api/users/:id", requireAuth(async (req, res, user) => {
  if (req.params.id === "me") {
    return res.json(publicUser(user));
  }

  const [target] = await query("SELECT * FROM users WHERE id = ?", [
    Number(req.params.id),
  ]);

  if (!target) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json(publicUser(target));
}));

// ---------------------------------------------------------------- Tickets

app.get("/api/tickets", requireAuth(async (req, res) => {
  const rows = await query("SELECT * FROM tickets ORDER BY created_at DESC");
  return res.json(await attachPeople(rows.map(mapTicket)));
}));

app.get("/api/tickets/mine", requireAuth(async (req, res, user) => {
  const rows = await query(
    `SELECT * FROM tickets
     WHERE uploaded_by = ? OR assignee_id = ?
     ORDER BY created_at DESC`,
    [user.id, user.id]
  );
  return res.json(await attachPeople(rows.map(mapTicket)));
}));

app.get("/api/tickets/:id", requireAuth(async (req, res) => {
  const [row] = await query("SELECT * FROM tickets WHERE id = ?", [
    Number(req.params.id),
  ]);

  if (!row) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  const ticket = mapTicket(row);
  const ids = [ticket.uploadedBy, ...(ticket.assigneeId ? [ticket.assigneeId] : [])];
  const ticketRows = ids.length
    ? await query(
        `SELECT * FROM users WHERE id IN (${ids.map(() => "?").join(", ")})`,
        ids
      )
    : [];
  const byId = new Map(ticketRows.map((u) => [u.id, u]));

  const comments = await query(
    `SELECT c.*, u.name AS author_name, u.username AS author_username
     FROM comments c
     JOIN users u ON u.id = c.created_by
     WHERE c.ticket_id = ?
     ORDER BY c.created_at ASC`,
    [ticket.id]
  );

  const attachments = await query(
    "SELECT * FROM attachments WHERE ticket_id = ? ORDER BY created_at ASC",
    [ticket.id]
  );

  return res.json({
    ...ticket,
    reporter: publicUser(byId.get(ticket.uploadedBy) ?? null),
    assignee: publicUser(byId.get(ticket.assigneeId) ?? null),
    comments: comments.map((c) => ({
      id: c.id,
      ticketId: c.ticket_id,
      createdBy: c.created_by,
      content: c.content,
      createdAt: toISO(c.created_at),
      author: {
        id: c.created_by,
        name: c.author_name,
        username: c.author_username,
      },
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      ticketId: a.ticket_id,
      uploadedBy: a.uploaded_by,
      originalFilename: a.original_filename,
      storedFilename: a.stored_filename,
      filePath: a.file_path,
      fileSizeBytes: a.file_size_bytes,
      mimeType: a.mime_type,
      createdAt: toISO(a.created_at),
    })),
  });
}));

app.post("/api/tickets", requireAuth(async (req, res, user) => {
  const {
    name,
    description = "",
    priority = "low",
    type = "servers",
    assigneeId = null,
  } = req.body ?? {};

  if (!name) {
    return res.status(400).json({ message: "Name is required" });
  }

  if (!["low", "moderate", "high", "critical"].includes(priority)) {
    return res.status(400).json({ message: "Invalid priority" });
  }

  if (!["servers", "computers"].includes(type)) {
    return res.status(400).json({ message: "Invalid type" });
  }

  const result = await query(
    `INSERT INTO tickets (name, description, status, priority, type, uploaded_by, assignee_id)
     VALUES (?, ?, 'open', ?, ?, ?, ?)`,
    [name, description, priority, type, user.id, assigneeId]
  );

  const [row] = await query("SELECT * FROM tickets WHERE id = ?", [
    result.insertId,
  ]);

  const tickets = await attachPeople([mapTicket(row)]);
  return res.status(201).json(tickets[0]);
}));

app.patch("/api/tickets/:id", requireAuth(async (req, res) => {
  const { status, priority, type, assigneeId } = req.body ?? {};
  const id = Number(req.params.id);

  if (status && !["open", "in_progress", "closed"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  if (priority && !["low", "moderate", "high", "critical"].includes(priority)) {
    return res.status(400).json({ message: "Invalid priority" });
  }
  if (type && !["servers", "computers"].includes(type)) {
    return res.status(400).json({ message: "Invalid type" });
  }

  await query(
    `UPDATE tickets
     SET status = COALESCE(?, status),
         priority = COALESCE(?, priority),
         type = COALESCE(?, type),
         assignee_id = ?
     WHERE id = ?`,
    [status ?? null, priority ?? null, type ?? null, assigneeId ?? null, id]
  );

  const [row] = await query("SELECT * FROM tickets WHERE id = ?", [id]);

  if (!row) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  const tickets = await attachPeople([mapTicket(row)]);
  return res.json(tickets[0]);
}));

// ---------------------------------------------------------------- Comments

app.post("/api/tickets/:id/comments", requireAuth(async (req, res, user) => {
  const { content } = req.body ?? {};
  const ticketId = Number(req.params.id);

  if (!content || !content.trim()) {
    return res.status(400).json({ message: "Content is required" });
  }

  const [ticket] = await query("SELECT id FROM tickets WHERE id = ?", [
    ticketId,
  ]);

  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  const result = await query(
    `INSERT INTO comments (ticket_id, created_by, content)
     VALUES (?, ?, ?)`,
    [ticketId, user.id, content.trim()]
  );

  const [row] = await query("SELECT * FROM comments WHERE id = ?", [
    result.insertId,
  ]);

  return res.status(201).json({
    id: row.id,
    ticketId: row.ticket_id,
    createdBy: row.created_by,
    content: row.content,
    createdAt: toISO(row.created_at),
  });
}));

// ---------------------------------------------------------------- Attachments

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    cb(null, crypto.randomUUID() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.post(
  "/api/tickets/:id/attachments",
  requireAuth(async (req, res, user) => {
    const ticketId = Number(req.params.id);

    const [ticket] = await query("SELECT id FROM tickets WHERE id = ?", [
      ticketId,
    ]);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const id = await new Promise((resolve, reject) => {
      const uploadSingle = upload.single("attachment");
      uploadSingle(req, res, (err) => {
        if (err) return reject(err);
        if (!req.file) return reject(new Error("No file uploaded"));
        resolve(req.file);
      });
    });

    const result = await query(
      `INSERT INTO attachments
       (ticket_id, uploaded_by, original_filename, stored_filename, file_path, file_size_bytes, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ticketId,
        user.id,
        id.originalname,
        id.filename,
        path.posix.join("/uploads", id.filename),
        id.size,
        id.mimetype,
      ]
    );

    const [row] = await query("SELECT * FROM attachments WHERE id = ?", [
      result.insertId,
    ]);

    return res.status(201).json({
      id: row.id,
      ticketId: row.ticket_id,
      uploadedBy: row.uploaded_by,
      originalFilename: row.original_filename,
      storedFilename: row.stored_filename,
      filePath: row.file_path,
      fileSizeBytes: row.file_size_bytes,
      mimeType: row.mime_type,
      createdAt: toISO(row.created_at),
    });
  })
);

// ---------------------------------------------------------------- Health

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ---------------------------------------------------------------- 404 + errors

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// ---------------------------------------------------------------- Boot

app.listen(PORT, () => {
  console.log(`Ticket backend listening on http://localhost:${PORT}`);
});