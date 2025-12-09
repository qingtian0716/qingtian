"use server";

import { NextRequest } from "next/server";
import { ensureSchema, getMySqlPool } from "~~/utils/db/mysql";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const hash = searchParams.get("hash");
        if (!hash) {
            return Response.json({ error: "hash is required" }, { status: 400 });
        }

        await ensureSchema();
        const pool = getMySqlPool();
        const [rows] = await pool.query("SELECT image_url FROM nft_images WHERE metadata_hash = ? LIMIT 1", [hash]);
        const result = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
        if (!result) {
            return Response.json({ found: false }, { status: 404 });
        }
        return Response.json({ found: true, imageUrl: result.image_url });
    } catch (error) {
        console.error("DB get image error:", error);
        return Response.json({ error: "Failed to get image url from DB" }, { status: 500 });
    }
}