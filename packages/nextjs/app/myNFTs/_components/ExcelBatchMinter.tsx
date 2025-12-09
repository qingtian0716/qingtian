"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

interface NFTResult {
    name: string;
    metadataHash: string;
    imageUrl: string;
}

export const ExcelBatchMinter = () => {
    const { address: connectedAddress } = useAccount();
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isMinting, setIsMinting] = useState(false);
    const [uploadResults, setUploadResults] = useState<NFTResult[]>([]);
    const [mintingProgress, setMintingProgress] = useState<number>(0);

    const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });

    const handleCsvFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setCsvFile(file);
        }
    };

    const handleImageFilesSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        setImageFiles(files);
    };

    const downloadTemplate = () => {
        const link = document.createElement('a');
        link.href = '/nft-batch-template.csv';
        link.download = 'nft-batch-template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        notification.success("模板文件下载成功！");
    };

    const handleBatchUpload = async () => {
        if (!csvFile) {
            notification.error("请选择CSV文件");
            return;
        }

        if (imageFiles.length === 0) {
            notification.error("请选择图片文件");
            return;
        }

        setIsUploading(true);
        const notificationId = notification.loading("正在批量上传图片和创建元数据...");

        try {
            const formData = new FormData();
            formData.append("csvFile", csvFile);

            imageFiles.forEach((file) => {
                formData.append("imageFiles", file);
            });

            const response = await fetch("/api/ipfs/batch-upload", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setUploadResults(result.results);
                notification.remove(notificationId);
                notification.success(`成功上传 ${result.results.length} 个NFT元数据！`);
            } else {
                throw new Error(result.error || "批量上传失败");
            }
        } catch (error) {
            notification.remove(notificationId);
            notification.error("批量上传失败");
            console.error("批量上传错误:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleBatchMint = async () => {
        if (uploadResults.length === 0) {
            notification.error("请先上传NFT数据");
            return;
        }

        setIsMinting(true);
        setMintingProgress(0);
        let currentNotificationId = notification.loading(`开始批量铸造 ${uploadResults.length} 个NFT...`);

        try {
            for (let i = 0; i < uploadResults.length; i++) {
                const nftResult = uploadResults[i];

                // 铸造NFT
                await writeContractAsync({
                    functionName: "mintItem",
                    args: [connectedAddress, nftResult.metadataHash],
                });

                // 更新进度
                setMintingProgress(i + 1);

                // 更新通知 - 先移除旧的，再创建新的
                notification.remove(currentNotificationId);
                currentNotificationId = notification.loading(`正在铸造第 ${i + 1}/${uploadResults.length} 个NFT: ${nftResult.name}...`);

                // 短暂延迟避免网络拥堵
                if (i < uploadResults.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }

            notification.remove(currentNotificationId);
            notification.success(`成功批量铸造了 ${uploadResults.length} 个自定义NFT！`);

            // 重置状态
            setMintingProgress(0);
            setCsvFile(null);
            setImageFiles([]);
            setUploadResults([]);
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
                <h2 className="card-title text-center">Excel Batch Mint</h2>
                <p className="text-center text-sm opacity-70 mb-4">
                    使用Excel批量铸造自定义NFT
                </p>

                {/* 下载模板按钮 */}
                <button
                    className="btn btn-outline btn-info mb-4"
                    onClick={downloadTemplate}
                >
                    📥 下载CSV模板
                </button>

                {/* CSV文件上传 */}
                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text">上传CSV文件</span>
                        <span className="label-text-alt">包含NFT信息</span>
                    </label>
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvFileSelect}
                        className="file-input file-input-bordered w-full"
                        disabled={isUploading || isMinting}
                    />
                </div>

                {/* 图片文件上传 */}
                <div className="form-control w-full mt-4">
                    <label className="label">
                        <span className="label-text">上传图片文件</span>
                        <span className="label-text-alt">支持多选</span>
                    </label>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageFilesSelect}
                        className="file-input file-input-bordered w-full"
                        disabled={isUploading || isMinting}
                    />
                </div>

                {/* 文件信息显示 */}
                {csvFile && (
                    <div className="alert alert-info mt-4">
                        <span>📄 CSV文件: {csvFile.name}</span>
                    </div>
                )}

                {imageFiles.length > 0 && (
                    <div className="alert alert-success mt-2">
                        <span>🖼️ 已选择 {imageFiles.length} 个图片文件</span>
                    </div>
                )}

                {/* 上传按钮 */}
                {csvFile && imageFiles.length > 0 && uploadResults.length === 0 && (
                    <button
                        className="btn btn-primary mt-4"
                        onClick={handleBatchUpload}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <>
                                <span className="loading loading-spinner loading-sm"></span>
                                上传中...
                            </>
                        ) : (
                            "批量上传到IPFS"
                        )}
                    </button>
                )}

                {/* 上传结果显示 */}
                {uploadResults.length > 0 && (
                    <div className="alert alert-success mt-4">
                        <div>
                            <div className="font-bold">✅ 上传完成!</div>
                            <div className="text-sm">准备铸造 {uploadResults.length} 个NFT</div>
                        </div>
                    </div>
                )}

                {/* 铸造进度显示 */}
                {isMinting && (
                    <div className="mt-4">
                        <div className="flex justify-between text-sm mb-2">
                            <span>铸造进度</span>
                            <span>{mintingProgress}/{uploadResults.length}</span>
                        </div>
                        <progress
                            className="progress progress-accent w-full"
                            value={mintingProgress}
                            max={uploadResults.length}
                        ></progress>
                    </div>
                )}

                {/* 铸造按钮 */}
                {uploadResults.length > 0 && (
                    <button
                        className="btn btn-accent mt-4"
                        onClick={handleBatchMint}
                        disabled={isMinting}
                    >
                        {isMinting ? (
                            <>
                                <span className="loading loading-spinner loading-sm"></span>
                                铸造中... ({mintingProgress}/{uploadResults.length})
                            </>
                        ) : (
                            `批量铸造 ${uploadResults.length} 个NFT`
                        )}
                    </button>
                )}

                {/* 说明文字 */}
                <div className="text-xs opacity-60 mt-4 text-center">
                    <div className="mb-2">📋 使用步骤:</div>
                    <div className="text-left space-y-1">
                        <div>1. 下载CSV模板并填写NFT信息</div>
                        <div>2. 准备对应的图片文件</div>
                        <div>3. 上传CSV和图片文件</div>
                        <div>4. 批量铸造NFT</div>
                    </div>
                </div>
            </div>
        </div>
    );
};