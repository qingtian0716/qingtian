"use client";

import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

export const AirdropMinter = () => {
    const { address: connectedAddress } = useAccount();
    const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });

    const [addressesText, setAddressesText] = useState("");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [metadataHash, setMetadataHash] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [isAirdropping, setIsAirdropping] = useState(false);
    const [progress, setProgress] = useState<number>(0);

    const recipients = useMemo(() => {
        const raw = addressesText
            .split(/\s|,|;|\n/)
            .map(s => s.trim())
            .filter(Boolean);
        const unique = Array.from(new Set(raw));
        const valid = unique.filter(a => isAddress(a as `0x${string}`));
        return valid as `0x${string}`[];
    }, [addressesText]);

    const invalidCount = useMemo(() => {
        const raw = addressesText
            .split(/\s|,|;|\n/)
            .map(s => s.trim())
            .filter(Boolean);
        const unique = Array.from(new Set(raw));
        return unique.filter(a => !isAddress(a as `0x${string}`)).length;
    }, [addressesText]);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        setImageFile(file);
    };

    const uploadAndCreateMetadata = async (): Promise<{ metadataHash: string; imageUrl: string }> => {
        if (metadataHash) return { metadataHash, imageUrl: '' };
        if (!imageFile) throw new Error("请先选择图片或直接填写元数据哈希");
        if (!name) throw new Error("请填写NFT名称");
        setIsUploading(true);
        const loadingId = notification.loading("正在上传图片并创建元数据...");
        try {
            const fd = new FormData();
            fd.append("file", imageFile);
            const imgRes = await fetch("/api/ipfs/upload-image", { method: "POST", body: fd });
            const imgJson = await imgRes.json();
            if (!imgJson.success) throw new Error(imgJson.error || "图片上传失败");

            const metaRes = await fetch("/api/ipfs/create-nft-metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageUrl: imgJson.imageUrl, name, description }),
            });
            const metaJson = await metaRes.json();
            if (!metaJson.success) throw new Error(metaJson.error || "元数据创建失败");
            setMetadataHash(metaJson.metadataHash);
            notification.remove(loadingId);
            notification.success("元数据已创建");
            // 注意：DB保存移到 handleAirdrop 中铸造成功后执行
            return { metadataHash: metaJson.metadataHash as string, imageUrl: imgJson.imageUrl as string };
        } catch (e) {
            notification.remove(loadingId);
            notification.error((e as Error).message || "上传或创建元数据失败");
            throw e;
        } finally {
            setIsUploading(false);
        }
    };

    const handleAirdrop = async () => {
        if (recipients.length === 0) {
            notification.error("请填写至少一个有效地址");
            return;
        }

        setIsAirdropping(true);
        setProgress(0);
        const loadingId = notification.loading(`开始空投到 ${recipients.length} 个地址...`);

        try {
            const result = await uploadAndCreateMetadata();
            const metaHash = result.metadataHash;
            const imgUrl = result.imageUrl;

            if (recipients.length > 1) {
                await writeContractAsync({ functionName: "airdropMint", args: [recipients, metaHash] });
                setProgress(recipients.length);
            } else {
                await writeContractAsync({ functionName: "mintItem", args: [recipients[0], metaHash] });
                setProgress(1);
            }

            // 铸造成功后保存到数据库
            if (imgUrl) {
                try {
                    await fetch("/api/db/save-image", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            walletAddress: connectedAddress,
                            metadataHash: metaHash,
                            imageUrl: imgUrl,
                        }),
                    });
                } catch (e) {
                    console.error("Save airdrop image to DB failed", e);
                }
            }

            notification.remove(loadingId);
            notification.success(`空投完成：${recipients.length} 个NFT已发送`);
            setAddressesText("");
            setProgress(0);
        } catch (e) {
            notification.remove(loadingId);
            notification.error(`空投中断，已完成 ${progress} 个`);
            console.error("Airdrop error:", e);
        } finally {
            setIsAirdropping(false);
        }
    };

    if (!connectedAddress) return null;

    return (
        <div className="card bg-base-100 shadow-xl w-full max-w-md mx-auto">
            <div className="card-body">
                <h2 className="card-title text-center">Airdrop NFTs</h2>
                <p className="text-center text-sm opacity-70 mb-4">向多个地址一次性发放同一NFT</p>

                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text">接收地址</span>
                        <span className="label-text-alt">支持换行/逗号/空格</span>
                    </label>
                    <textarea
                        className="textarea textarea-bordered min-h-24"
                        placeholder="0xabc..., 0xdef...\n0x123..."
                        value={addressesText}
                        onChange={e => setAddressesText(e.target.value)}
                        disabled={isUploading || isAirdropping}
                    />
                    <div className="text-xs mt-1">
                        <span className="mr-2">有效: {recipients.length}</span>
                        {invalidCount > 0 ? <span className="text-error">无效: {invalidCount}</span> : null}
                    </div>
                </div>

                <div className="divider" />

                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text">NFT名称</span>
                    </label>
                    <input
                        type="text"
                        className="input input-bordered"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="例如：VIP Airdrop #1"
                        disabled={!!metadataHash || isUploading || isAirdropping}
                    />
                </div>

                <div className="form-control w-full mt-3">
                    <label className="label">
                        <span className="label-text">描述</span>
                    </label>
                    <input
                        type="text"
                        className="input input-bordered"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="可选"
                        disabled={!!metadataHash || isUploading || isAirdropping}
                    />
                </div>

                <div className="form-control w-full mt-3">
                    <label className="label">
                        <span className="label-text">图片文件</span>
                        <span className="label-text-alt">用于生成元数据</span>
                    </label>
                    <input
                        type="file"
                        accept="image/*"
                        className="file-input file-input-bordered w-full"
                        onChange={handleImageSelect}
                        disabled={!!metadataHash || isUploading || isAirdropping}
                    />
                </div>

                <div className="form-control w-full mt-3">
                    <label className="label">
                        <span className="label-text">或直接填写元数据哈希</span>
                        <span className="label-text-alt">无需上传图片</span>
                    </label>
                    <input
                        type="text"
                        className="input input-bordered"
                        placeholder="Qm... 或 bafy..."
                        value={metadataHash}
                        onChange={e => setMetadataHash(e.target.value.trim())}
                        disabled={isUploading || isAirdropping}
                    />
                </div>

                {isAirdropping && (
                    <div className="mt-4">
                        <div className="flex justify-between text-sm mb-2">
                            <span>空投进度</span>
                            <span>
                                {progress}/{recipients.length}
                            </span>
                        </div>
                        <progress className="progress progress-primary w-full" value={progress} max={recipients.length}></progress>
                    </div>
                )}

                <button
                    className="btn btn-primary mt-4"
                    onClick={handleAirdrop}
                    disabled={
                        isUploading ||
                        isAirdropping ||
                        recipients.length === 0 ||
                        (!metadataHash && !imageFile) ||
                        (!!imageFile && !name)
                    }
                >
                    {isAirdropping ? (
                        <>
                            <span className="loading loading-spinner loading-sm"></span>
                            空投中... ({progress}/{recipients.length})
                        </>
                    ) : (
                        `空投到 ${recipients.length} 个地址`
                    )}
                </button>

                <div className="text-xs opacity-60 mt-2 text-center">
                    * 每个地址将收到一枚相同元数据的NFT
                    <br />* 需要逐笔确认交易
                </div>
            </div>
        </div>
    );
};