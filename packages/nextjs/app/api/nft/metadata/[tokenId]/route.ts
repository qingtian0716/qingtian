import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, defineChain } from "viem";

// Pinata Gateway 配置
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";

// 定义自定义链配置用于 localgeth
const localgeth = defineChain({
    id: 1337,
    name: 'LocalGeth',
    nativeCurrency: {
        decimals: 18,
        name: 'Ether',
        symbol: 'ETH',
    },
    rpcUrls: {
        default: {
            http: [process.env.NEXT_PUBLIC_RPC_URL || 'http://47.94.148.98:8889'],
        },
    },
});

// 创建公共客户端来读取合约
const publicClient = createPublicClient({
    chain: localgeth,
    transport: http(),
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ tokenId: string }> }
) {
    try {
        const { tokenId } = await params;

        if (!tokenId) {
            return NextResponse.json({ error: "Token ID is required" }, { status: 400 });
        }

        // 从 YourCollectible 合约获取 tokenURI
        const tokenURI = await publicClient.readContract({
            address: process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS as `0x${string}`,
            abi: [
                {
                    inputs: [{ name: "tokenId", type: "uint256" }],
                    name: "tokenURI",
                    outputs: [{ name: "", type: "string" }],
                    stateMutability: "view",
                    type: "function",
                },
            ],
            functionName: "tokenURI",
            args: [BigInt(tokenId)],
        });

        if (!tokenURI) {
            return NextResponse.json({ error: "Token URI not found" }, { status: 404 });
        }

        // 如果是 IPFS URL，转换为可访问的 URL
        let metadataUrl = tokenURI as string;
        if (metadataUrl.startsWith("ipfs://")) {
            metadataUrl = metadataUrl.replace("ipfs://", `https://${PINATA_GATEWAY}/ipfs/`);
        }

        // 获取元数据
        const metadataResponse = await fetch(metadataUrl);
        if (!metadataResponse.ok) {
            return NextResponse.json({ error: "Failed to fetch metadata" }, { status: 500 });
        }

        const metadata = await metadataResponse.json();

        // 如果图片是 IPFS URL，也转换一下
        if (metadata.image && metadata.image.startsWith("ipfs://")) {
            metadata.image = metadata.image.replace("ipfs://", `https://${PINATA_GATEWAY}/ipfs/`);
        }

        return NextResponse.json(metadata);
    } catch (error) {
        console.error("Error fetching NFT metadata:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}