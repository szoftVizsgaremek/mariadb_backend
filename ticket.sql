DROP DATABASE IF EXISTS ticket_db;
CREATE DATABASE IF NOT EXISTS ticket_db;

USE ticket_db;

CREATE TABLE users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(70) NOT NULL,
    username VARCHAR(70) NOT NULL UNIQUE,
    hash VARCHAR(200) NOT NULL,
    birth_date DATE NULL,
    role ENUM('user', 'area_manager', 'admin') NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tickets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(250) NOT NULL,
    status ENUM('open', 'in_progress', 'closed') NOT NULL DEFAULT 'open',
    priority ENUM('low', 'moderate', 'high', 'critical') NOT NULL DEFAULT 'low',
    type ENUM('servers', 'computers') NOT NULL,
    uploaded_by INT NOT NULL,
    assignee_id INT NULL, -- NULLable in case ticket is not assigned yet
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_tickets_uploaded_by 
        FOREIGN KEY (uploaded_by) REFERENCES users(id) 
        ON DELETE RESTRICT,
        
    CONSTRAINT fk_tickets_assignee 
        FOREIGN KEY (assignee_id) REFERENCES users(id) 
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE attachments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    uploaded_by INT NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL UNIQUE,
    file_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT UNSIGNED NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_attachments_ticket 
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) 
        ON DELETE CASCADE,

    CONSTRAINT fk_attachments_user 
        FOREIGN KEY (uploaded_by) REFERENCES users(id) 
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE comments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    created_by INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_comments_ticket 
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) 
        ON DELETE CASCADE,

    CONSTRAINT fk_comments_user 
        FOREIGN KEY (created_by) REFERENCES users(id) 
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE password_resets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_password_resets_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE ticket_db;

-- (Hashed values represent sample bcrypt strings)
INSERT INTO users (name, username, hash, birth_date, role, email) VALUES
('Alex Rivera', 'arivera', '$2b$12$uTr/uflYf2MSjnEX0zBaZO7tn5Wk3DdD38r745YRxlJ7iF3l5Ytja', '1988-04-12', 'admin', 'alex.rivera@company.com'),
('Sarah Chen', 'schen', '$2b$12$uTr/uflYf2MSjnEX0zBaZO7tn5Wk3DdD38r745YRxlJ7iF3l5Ytja', '1992-08-25', 'area_manager', 'sarah.chen@company.com'),
('Jordan Miller', 'jmiller', '$2b$12$uTr/uflYf2MSjnEX0zBaZO7tn5Wk3DdD38r745YRxlJ7iF3l5Ytja', '1995-11-03', 'area_manager', 'jordan.miller@company.com'),
('David Taylor', 'dtaylor', '$2b$12$uTr/uflYf2MSjnEX0zBaZO7tn5Wk3DdD38r745YRxlJ7iF3l5Ytja', '1998-01-19', 'user', 'david.taylor@company.com'),
('Emma Watson', 'ewatson', '$2b$12$uTr/uflYf2MSjnEX0zBaZO7tn5Wk3DdD38r745YRxlJ7iF3l5Ytja', '2001-06-30', 'user', 'emma.watson@company.com');

INSERT INTO tickets (name, description, status, priority, type, uploaded_by, assignee_id) VALUES
('Database Replica Failure', 'Secondary MariaDB replica node is failing health checks due to disk space exhaustion.', 'open', 'critical', 'servers', 4, 2),
('Monitors Not Displaying', 'Dual monitor setup on Desk 14 is not receiving signal after office floor renovation.', 'in_progress', 'moderate', 'computers', 5, 3),
('Kernel Panic on Web-02', 'Web application server crashed with kernel panic after latest patch update.', 'open', 'high', 'servers', 4, 2),
('Laptop Keyboard Sticking', 'Spacebar and Enter keys are sticking on workstation laptop.', 'closed', 'low', 'computers', 5, 3);

INSERT INTO attachments (ticket_id, uploaded_by, original_filename, stored_filename, file_path, file_size_bytes, mime_type) VALUES
(1, 4, 'replica_error_log.txt', 'a1b2c3d4-8f9e-4a1b-bc2d-3e4f5a6b7c8d.txt', '/uploads/2026/09/a1b2c3d4-8f9e-4a1b-bc2d-3e4f5a6b7c8d.txt', 15420, 'text/plain'),
(1, 2, 'disk_usage_grafana.png', 'e5f6g7h8-1a2b-3c4d-5e6f-7a8b9c0d1e2f.png', '/uploads/2026/09/e5f6g7h8-1a2b-3c4d-5e6f-7a8b9c0d1e2f.png', 245890, 'image/png'),
(3, 4, 'crash_dump.log', '9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c.log', '/uploads/2026/09/9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c.log', 892100, 'text/plain');

INSERT INTO comments (ticket_id, created_by, content) VALUES
(1, 2, 'I am currently expanding the LVM partition on node 2 to free up space.'),
(1, 4, 'Thanks Sarah, let me know when replica sync resumes.'),
(2, 3, 'Tested cables on Desk 14; ordering replacement DisplayPort cable.'),
(3, 2, 'Rolling back kernel to previous stable version 6.1.0-18.');