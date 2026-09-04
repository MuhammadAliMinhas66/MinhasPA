-- Run this in SSMS, connected to the MinhasPA database
-- Adds user accounts for JWT-based login/signup. Passwords are NEVER stored
-- in plain text — only a bcrypt hash (password_hash) is saved, generated
-- server-side in routes/auth.js. This table can safely be exposed on a
-- hosted app as long as JWT_SECRET in your .env is a real random value.

USE MinhasPA;
GO

IF OBJECT_ID('dbo.users', 'U') IS NOT NULL
    DROP TABLE dbo.users;
GO

CREATE TABLE dbo.users (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    full_name      NVARCHAR(80)   NOT NULL,
    username       VARCHAR(40)    NOT NULL UNIQUE,
    email          VARCHAR(120)   NOT NULL UNIQUE,
    password_hash  VARCHAR(100)   NOT NULL,   -- bcrypt hash, ~60 chars
    role           VARCHAR(20)    NOT NULL DEFAULT 'user',  -- 'user' or 'super_admin'
    created_at     DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    last_login_at  DATETIME2      NULL
);
GO

-- If you already have data and don't want to drop/recreate, run just the
-- CREATE TABLE block above (skip the DROP) instead.

-- ALTER TABLE migration (if you already had a users table from an older
-- version and just want to add last_login_at):
-- ALTER TABLE dbo.users ADD last_login_at DATETIME2 NULL;
