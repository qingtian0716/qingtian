"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { addToIPFS } from "~~/utils/simpleNFT/ipfs-fetch";
import nftsMetadata from "~~/utils/simpleNFT/nftsMetadata";

export const BatchNFTMinter = () => {
    const { address: connectedAddress } = useAccount();
    const [batchSize, setBatchSize] = useState<number>(5);
    const [isMinting, setIsMinting] = useState(false);
    const [mintingProgress, setMintingProgress] = useState<number>(0);

    const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });

    const handleBatchMint = async () => {
        if (batchSize < 1 || batchSize > 20) {
            notification.error("批量数量必须在1-20之间");
            return;
        }

        setIsMinting(true);
        setMintingProgress(0);
        let currentNotificationId = notification.loading(`开始批量铸造 ${batchSize} 个NFT...`);

        try {
            for (let i = 0; i < batchSize; i++) {
                // 选择元数据（循环使用预设的元数据）
                const currentTokenMetaData = nftsMetadata[i % nftsMetadata.length];

                // 上传元数据到IPFS
                const uploadedItem = await addToIPFS(currentTokenMetaData);

                // 铸造NFT
                await writeContractAsync({
                    functionName: "mintItem",
                    args: [connectedAddress, uploadedItem.path],
                });

                // 铸造成功后保存到数据库
                try {
                    await fetch("/api/db/save-image", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            walletAddress: connectedAddress,
                            metadataHash: uploadedItem.path,
                            imageUrl: currentTokenMetaData.image,
                        }),
                    });
                } catch (e) {
                    console.error("Save batch image to DB failed", e);
                }

                // 更新进度
                setMintingProgress(i + 1);

                // 更新通知 - 先移除旧的，再创建新的
                notification.remove(currentNotificationId);
                currentNotificationId = notification.loading(`正在铸造第 ${i + 1}/${batchSize} 个NFT...`);

                // 短暂延迟避免网络拥堵
                if (i < batchSize - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            notification.remove(currentNotificationId);
            notification.success(`成功批量铸造了 ${batchSize} 个NFT！`);

            // 重置状态
            setMintingProgress(0);
            setBatchSize(5);
        } catch (error) {
            notification.remove(currentNotificationId);
            notification.error(`批量铸造失败，已成功铸造 ${mintingProgress} 个NFT`);
            console.error("批量铸造错误:", error);
        } finally {
            setIsMinting(false);
            setMintingProgress(0);
        }
    };

    return (
        <div className="card bg-base-100 shadow-xl w-full max-w-md mx-auto">
            <div className="card-body">
                <h2 className="card-title text-center">Batch Mint NFTs</h2>
                <p className="text-center text-sm opacity-70 mb-4">
                    批量铸造预设NFT集合
                </p>

                {/* 批量数量选择 */}
                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text">铸造数量</span>
                        <span className="label-text-alt">1-20个</span>
                    </label>
                    <input
                        type="number"
                        min="1"
                        max="20"
                        value={batchSize}
                        onChange={(e) => setBatchSize(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                        className="input input-bordered w-full"
                        disabled={isMinting}
                    />
                </div>

                {/* 进度显示 */}
                {isMinting && (
                    <div className="mt-4">
                        <div className="flex justify-between text-sm mb-2">
                            <span>铸造进度</span>
                            <span>{mintingProgress}/{batchSize}</span>
                        </div>
                        <progress
                            className="progress progress-primary w-full"
                            value={mintingProgress}
                            max={batchSize}
                        ></progress>
                    </div>
                )}

                {/* 预估费用提示 */}
                <div className="alert alert-info mt-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <div>
                        <div className="text-sm">
                            将铸造 {batchSize} 个NFT，每个NFT需要一次交易
                        </div>
                    </div>
                </div>

                {/* 铸造按钮 */}
                <button
                    className="btn btn-accent mt-4"
                    onClick={handleBatchMint}
                    disabled={isMinting || batchSize < 1 || batchSize > 20}
                >
                    {isMinting ? (
                        <>
                            <span className="loading loading-spinner loading-sm"></span>
                            铸造中... ({mintingProgress}/{batchSize})
                        </>
                    ) : (
                        `批量铸造 ${batchSize} 个NFT`
                    )}
                </button>

                {/* 说明文字 */}
                <div className="text-xs opacity-60 mt-2 text-center">
                    * 批量铸造将使用预设的NFT元数据
                    <br />
                    * 每个NFT需要单独的交易确认
                </div>
            </div>
        </div>
    );
};