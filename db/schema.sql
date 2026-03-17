"""
Database access layer for big_spendr.

Handles SQL db initialization, connections, and CRUD
operations for storing and retrieving spend data.
"""

"""
households table
CREATE TABLE IF NOT EXISTS households (
    household_id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    );
"""

"""
users table
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_role TEXT NOT NULL,
    FOREIGN KEY (household_id) REFERENCES households(household_id),
    password TEXT NOT NULL
);
"""

"""
accounts table
CREATE TABLE IF NOT EXISTS accounts (
    account_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_type TEXT NOT NULL,
    name TEXT NOT NULL,
    institution TEXT NOT NULL,
    nickname TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (household_id) REFERENCES households(household_id),
);
"""

"""
transactions table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date TEXT NOT NULL,
    transaction_amount REAL NOT NULL CHECK(transaction_amount > 0),
    merchant TEXT NOT NULL,
    spending_category TEXT NOT NULL,
    FOREIGN KEY (household_id) REFERENCES households(household_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);
"""
