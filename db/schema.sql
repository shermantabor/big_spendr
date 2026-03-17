-- big_spendr database schema
-- SQLite

-- households table
CREATE TABLE IF NOT EXISTS households (
    household_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- users table
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (household_id) REFERENCES households(household_id)
);

-- accounts table
CREATE TABLE IF NOT EXISTS accounts (
    account_id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    nickname TEXT NOT NULL,
    type TEXT NOT NULL,
    institution TEXT NOT NULL,
    last_four TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (household_id) REFERENCES households(household_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

-- categories table
CREATE TABLE IF NOT EXISTS categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (household_id) REFERENCES households(household_id)
);

-- category_rules table
CREATE TABLE IF NOT EXISTS category_rules (
    rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL,
    merchant_pattern TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL,
    FOREIGN KEY (household_id) REFERENCES households(household_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

-- transactions table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    category_id INTEGER,
    amount REAL NOT NULL CHECK(amount > 0),
    date TEXT N