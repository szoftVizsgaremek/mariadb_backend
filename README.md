# Ticket MariaDB Backend

Express + MariaDB backend for the ticket support system. Replaces the old
in-memory backend with persistent storage via the `ticket_db` database.

## Prerequisites

- **Node.js >= 22**
- **MariaDB server** running on localhost:3306

## Setup

```bash
npm install
cp .env.example .env   # edit with your MariaDB credentials
npm run db:setup        # creates and seeds ticket_db
npm start               # starts on http://localhost:8080
```

## Environment variables (.env)

| Variable     | Default       | Description                    |
| ------------ | ------------- | ------------------------------ |
| `DB_HOST`    | localhost     | MariaDB host                   |
| `DB_PORT`    | 3306          | MariaDB port                   |
| `DB_USER`    | root          | MariaDB user                   |
| `DB_PASSWORD`|               | MariaDB password               |
| `DB_NAME`    | ticket_db     | Database name                  |
| `PORT`       | 8080          | Express listen port            |
| `UPLOADS_DIR`| uploads       | Attachment file storage dir    |
| `COOKIE_SECURE`| false       | Send session cookie with Secure flag |
| `CORS_ORIGINS`|             | Comma-separated extra allowed origins |
| `FRONTEND_URL`| http://localhost:5173 | Base URL used in reset links |
| `SMTP_HOST`  |               | SMTP server (empty = log emails to console) |
| `SMTP_PORT`  | 587           | SMTP port                      |
| `SMTP_USER`  |               | SMTP username / sender         |
| `SMTP_PASS`  |               | SMTP password                  |
| `EMAIL_FROM` |               | From address (defaults to SMTP_USER) |

## Seed accounts

All seed users have password `password123`:

| Name          | Username  | Email                      | Role         |
| ------------- | --------- | -------------------------- | ------------ |
| Alex Rivera   | arivera   | alex.rivera@company.com    | admin        |
| Sarah Chen    | schen     | sarah.chen@company.com     | area_manager |
| Jordan Miller | jmiller   | jordan.miller@company.com  | area_manager |
| David Taylor  | dtaylor   | david.taylor@company.com   | user         |
| Emma Watson   | ewatson   | emma.watson@company.com    | user         |

## API endpoints

| Method | Path                       | Description                        |
| ------ | -------------------------- | ---------------------------------- |
| POST   | `/api/auth/login`          | Login (username + password)        |
| POST   | `/api/auth/forgot-password`| Request password-reset email       |
| POST   | `/api/auth/reset-password` | Set new password from reset token  |
| POST   | `/api/auth/logout`         | Logout                             |
| GET    | `/api/auth/me`             | Current authenticated user         |
| GET    | `/api/users`               | All users                          |
| POST   | `/api/users`               | Create user (admin only)           |
| GET    | `/api/users/:id`           | Single user                        |
| GET    | `/api/tickets`             | All tickets (with reporter/assignee) |
| GET    | `/api/tickets/mine`        | Tickets for current user           |
| GET    | `/api/tickets/:id`         | Ticket detail + comments + attachments |
| POST   | `/api/tickets`             | Create ticket                      |
| PATCH  | `/api/tickets/:id`         | Update status / priority / assignee |
| POST   | `/api/tickets/:id/comments`| Add comment                        |
| POST   | `/api/tickets/:id/attachments` | Upload attachment (multipart)  |
| GET    | `/uploads/:filename`       | Served uploaded files              |
| GET    | `/api/health`              | Health check                       |
