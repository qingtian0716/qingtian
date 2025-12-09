import mysql from "mysql2/promise";

type MySqlPool = mysql.Pool;

declare global {
    // eslint-disable-next-line no-var
    var __MYSQL_POOL__: MySqlPool | undefined;
}

const getEnv = (key: string, fallback?: string): string => {
    const val = process.env[key];
    if (val === undefined || val === "") {
        if (fallback !== undefined) return fallback;
        throw new Error(`Missing required env: ${key}`);
    }
    return val;
};

export const getMySqlPool = (): MySqlPool => {
    if (!global.__MYSQL_POOL__) {
        global.__MYSQL_POOL__ = mysql.createPool({
            host: getEnv("DB_HOST", "localhost"),
            port: parseInt(getEnv("DB_PORT", "3306"), 10),
            user: getEnv("DB_USER"),
            password: getEnv("DB_PASSWORD"),
            database: getEnv("DB_DATABASE"),
            connectionLimit: 5,
            waitForConnections: true,
            queueLimit: 0,
        });
    }
    return global.__MYSQL_POOL__!;
};

export const ensureSchema = async () => {
    const pool = getMySqlPool();
    await pool.query(
        `CREATE TABLE IF NOT EXISTS nft_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      wallet_address VARCHAR(64) NOT NULL,
      metadata_hash VARCHAR(191) NOT NULL,
      image_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_metadata_hash (metadata_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
};