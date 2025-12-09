"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

export const CustomNFTMinter = () => {
    const { address: connectedAddress } = useAccount();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>("");
    const [nftName, setNftName] = useState<string>("");
    const [nftDescription, setNftDescription] = useState<string>("");
    const [isUploading, setIsUploading] = useState(false);
    const [isMinting, setIsMinting] = useState(false);
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string>("");

    const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const uploadImageToPinata = async () => {
        if (!selectedFile) {
            notification.error("Please select an image first");
            return;
        }

        setIsUploading(true);
        const notificationId = notification.loading("Uploading image to IPFS...");

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            const response = await fetch("/api/ipfs/upload-image", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setUploadedImageUrl(result.imageUrl);
                notification.remove(notificationId);
                notification.success("Image uploaded to IPFS successfully!");
            } else {
                throw new Error(result.error || "Upload failed");
            }
        } catch (error) {
            notification.remove(notificationId);
            notification.error("Failed to upload image to IPFS");
            console.error("Upload error:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const mintCustomNFT = async () => {
        if (!uploadedImageUrl || !nftName.trim()) {
            notification.error("Please upload an image and provide a name");
            return;
        }

        setIsMinting(true);
        const notificationId = notification.loading("Creating NFT metadata and minting...");

        try {
            // Create NFT metadata
            const metadataResponse = await fetch("/api/ipfs/create-nft-metadata", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    imageUrl: uploadedImageUrl,
                    name: nftName,
                    description: nftDescription || `Custom NFT: ${nftName}`,
                    attributes: [
                        {
                            trait_type: "Type",
                            value: "Custom Upload",
                        },
                        {
                            trait_type: "Created",
                            value: new Date().toISOString().split('T')[0],
                        },
                    ],
                }),
            });

            const metadataResult = await metadataResponse.json();

            if (!metadataResult.success) {
                throw new Error(metadataResult.error || "Failed to create metadata");
            }

            // Mint the NFT
            await writeContractAsync({
                functionName: "mintItem",
                args: [connectedAddress, metadataResult.metadataHash],
            });

            notification.remove(notificationId);
            notification.success("Custom NFT minted successfully!");

            // Reset form
            setSelectedFile(null);
            setPreviewUrl("");
            setNftName("");
            setNftDescription("");
            setUploadedImageUrl("");
        } catch (error) {
            notification.remove(notificationId);
            notification.error("Failed to mint custom NFT");
            console.error("Minting error:", error);
        } finally {
            setIsMinting(false);
        }
    };

    return (
        <div className="card bg-base-100 shadow-xl w-full max-w-md mx-auto">
            <div className="card-body">
                <h2 className="card-title text-center">Create Custom NFT</h2>

                {/* File Upload */}
                <div className="form-control w-full">
                    <label className="label">
                        <span className="label-text">Upload Image</span>
                    </label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="file-input file-input-bordered w-full"
                    />
                </div>

                {/* Image Preview */}
                {previewUrl && (
                    <div className="mt-4">
                        <img
                            src={previewUrl}
                            alt="Preview"
                            className="w-full h-48 object-cover rounded-lg border"
                        />
                    </div>
                )}

                {/* Upload Button */}
                {selectedFile && !uploadedImageUrl && (
                    <button
                        className="btn btn-primary mt-4"
                        onClick={uploadImageToPinata}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <>
                                <span className="loading loading-spinner loading-sm"></span>
                                Uploading to IPFS...
                            </>
                        ) : (
                            "Upload to IPFS"
                        )}
                    </button>
                )}

                {/* Success message for upload */}
                {uploadedImageUrl && (
                    <div className="alert alert-success mt-4">
                        <span>✓ Image uploaded to IPFS successfully!</span>
                    </div>
                )}

                {/* NFT Details Form */}
                {uploadedImageUrl && (
                    <>
                        <div className="form-control w-full mt-4">
                            <label className="label">
                                <span className="label-text">NFT Name *</span>
                            </label>
                            <input
                                type="text"
                                placeholder="Enter NFT name"
                                className="input input-bordered w-full"
                                value={nftName}
                                onChange={(e) => setNftName(e.target.value)}
                            />
                        </div>

                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text">Description (Optional)</span>
                            </label>
                            <textarea
                                placeholder="Enter NFT description"
                                className="textarea textarea-bordered w-full"
                                value={nftDescription}
                                onChange={(e) => setNftDescription(e.target.value)}
                            />
                        </div>

                        {/* Mint Button */}
                        <button
                            className="btn btn-secondary mt-4"
                            onClick={mintCustomNFT}
                            disabled={isMinting || !nftName.trim()}
                        >
                            {isMinting ? (
                                <>
                                    <span className="loading loading-spinner loading-sm"></span>
                                    Minting NFT...
                                </>
                            ) : (
                                "Mint Custom NFT"
                            )}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};