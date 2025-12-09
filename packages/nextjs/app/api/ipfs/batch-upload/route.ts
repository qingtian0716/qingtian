import { NextRequest, NextResponse } from "next/server";

const PINATA_API_KEY = process.env.PINATA_API_KEY || "your_pinata_api_key_here";
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || "your_pinata_secret_key_here";
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const csvFile = formData.get("csvFile") as File;
        const imageFiles = formData.getAll("imageFiles") as File[];

        if (!csvFile) {
            return NextResponse.json({ success: false, error: "CSV文件是必需的" });
        }

        if (imageFiles.length === 0) {
            return NextResponse.json({ success: false, error: "至少需要上传一张图片" });
        }

        // 解析CSV文件
        const csvText = await csvFile.text();
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

        const nftData = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
                const nft: any = {};
                headers.forEach((header, index) => {
                    nft[header] = values[index] || '';
                });
                nftData.push(nft);
            }
        }

        if (nftData.length === 0) {
            return NextResponse.json({ success: false, error: "CSV文件中没有有效数据" });
        }

        // 批量上传图片到Pinata
        const uploadedImages: { [key: string]: string } = {};

        for (const imageFile of imageFiles) {
            const imageFormData = new FormData();
            imageFormData.append("file", imageFile);

            const pinataMetadata = JSON.stringify({
                name: `NFT_Image_${imageFile.name}_${Date.now()}`,
            });
            imageFormData.append("pinataMetadata", pinataMetadata);

            const pinataOptions = JSON.stringify({
                cidVersion: 0,
            });
            imageFormData.append("pinataOptions", pinataOptions);

            const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
                method: "POST",
                headers: {
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: PINATA_SECRET_API_KEY,
                },
                body: imageFormData,
            });

            if (!pinataResponse.ok) {
                const errorText = await pinataResponse.text();
                console.error("Pinata upload error:", errorText);
                throw new Error(`Failed to upload image ${imageFile.name} to Pinata: ${errorText}`);
            }

            const pinataResult = await pinataResponse.json();
            const imageUrl = `https://${PINATA_GATEWAY}/ipfs/${pinataResult.IpfsHash}`;
            uploadedImages[imageFile.name] = imageUrl;
        }

        // 为每个NFT创建元数据并上传到IPFS
        const metadataResults = [];

        for (const nft of nftData) {
            const imageUrl = uploadedImages[nft.image_file];
            if (!imageUrl) {
                console.warn(`Image file ${nft.image_file} not found for NFT ${nft.name}`);
                continue;
            }

            // 构建属性数组
            const attributes = [];
            for (let i = 1; i <= 3; i++) {
                const traitType = nft[`trait_type_${i}`];
                const traitValue = nft[`trait_value_${i}`];
                if (traitType && traitValue) {
                    attributes.push({
                        trait_type: traitType,
                        value: traitValue
                    });
                }
            }

            // 添加默认属性
            attributes.push({
                trait_type: "Batch Upload",
                value: "Excel Import"
            });
            attributes.push({
                trait_type: "Created",
                value: new Date().toISOString().split('T')[0]
            });

            const metadata = {
                name: nft.name,
                description: nft.description || `Custom NFT: ${nft.name}`,
                image: imageUrl,
                attributes: attributes
            };

            // 上传元数据到Pinata
            const metadataResponse = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: PINATA_SECRET_API_KEY,
                },
                body: JSON.stringify({
                    pinataContent: metadata,
                    pinataMetadata: {
                        name: `${nft.name}-metadata.json`,
                    },
                }),
            });

            if (!metadataResponse.ok) {
                const errorText = await metadataResponse.text();
                console.error("Metadata upload error:", errorText);
                throw new Error(`Failed to upload metadata for ${nft.name} to Pinata: ${errorText}`);
            }

            const metadataResult = await metadataResponse.json();
            metadataResults.push({
                name: nft.name,
                metadataHash: metadataResult.IpfsHash,
                imageUrl: imageUrl
            });
        }

        return NextResponse.json({
            success: true,
            message: `成功处理 ${metadataResults.length} 个NFT`,
            results: metadataResults
        });

    } catch (error) {
        console.error("Batch upload error:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "批量上传失败"
        });
    }
}