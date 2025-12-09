"use server";

import { NextRequest } from "next/server";
import { ensureSchema, getMySqlPool } from "~~/utils/db/mysql";

export async function POST(request: NextRequest) {
    try {
        const { walletAddress, metadataHash, imageUrl } = await request.json();
        if (!walletAddress || !metadataHash || !imageUrl) {
            return Response.json({ error: "walletAddress, metadataHash, imageUrl are required" }, { status: 400 });
        }

        await ensureSchema();
        const pool = getMySqlPool();
        await pool.query(
            `INSERT INTO nft_images (wallet_address, metadata_hash, image_url)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE image_url = VALUES(image_url)`,
            [walletAddress, metadataHash, imageUrl],
        );

        return Response.json({ success: true });
    } catch (error) {
        console.error("DB save image error:", error);
        return Response.json({ error: "Failed to save image url to DB" }, { status: 500 });
    }
}