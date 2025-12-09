"use server";

import { NextRequest } from "next/server";

const PINATA_API_KEY = process.env.PINATA_API_KEY || "your_pinata_api_key_here";
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || "your_pinata_secret_key_here";
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return Response.json({ error: "No file provided" }, { status: 400 });
        }

        // Create FormData for Pinata
        const pinataFormData = new FormData();
        pinataFormData.append("file", file);

        const pinataMetadata = JSON.stringify({
            name: `NFT_Image_${Date.now()}`,
        });
        pinataFormData.append("pinataMetadata", pinataMetadata);

        const pinataOptions = JSON.stringify({
            cidVersion: 0,
        });
        pinataFormData.append("pinataOptions", pinataOptions);

        // Upload to Pinata
        const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: {
                pinata_api_key: PINATA_API_KEY,
                pinata_secret_api_key: PINATA_SECRET_API_KEY,
            },
            body: pinataFormData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Pinata upload error:", errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return Response.json({
            success: true,
            ipfsHash: result.IpfsHash,
            imageUrl: `https://${PINATA_GATEWAY}/ipfs/${result.IpfsHash}`
        });
    } catch (error) {
        console.error("Error uploading image to Pinata:", error);
        return Response.json({ error: "Error uploading image to Pinata" }, { status: 500 });
    }
}