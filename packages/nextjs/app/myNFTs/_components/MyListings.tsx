"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract, useScaffoldContract } from "~~/hooks/scaffold-eth";
// --- 修改：引入 parseEther 用于改价 ---
import { formatEther, parseEther } from "viem";
import { getMetadataFromIPFS } from "~~/utils/simpleNFT/ipfs-fetch";

interface ListingWithId {
    listingId: bigint;
    tokenId: bigint;
    nftContract: `0x${string}`;
    seller: `0x${string}`;
    price: bigint;
    active: boolean;
}

interface NFTMetadata {
    name?: string;
    description?: string;
    image?: string;
    attributes?: Array<{ trait_type?: string; value?: string }>;
}

interface MyListingItem extends ListingWithId {
    metadata?: NFTMetadata;
}

export const MyListings = () => {
    const { address: connectedAddress } = useAccount();
    const [myListings, setMyListings] = useState<MyListingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancellingId, setCancellingId] = useState<bigint | null>(null);

    // --- 批量下架状态 ---
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedListingIds, setSelectedListingIds] = useState<bigint[]>([]);
    const [isBulkCancelling, setIsBulkCancelling] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current?: bigint } | null>(null);

    // --- 新增功能：改价/暂停状态 ---
    const [editPrices, setEditPrices] = useState<Record<string, string>>({});
    const [updatingId, setUpdatingId] = useState<bigint | null>(null);
    const [pausingId, setPausingId] = useState<bigint | null>(null);

    const { data: activeListings, refetch: refetchListings } = useScaffoldReadContract({
        contractName: "NFTMarketplace",
        functionName: "getAllActiveListings",
    });

    const { writeContractAsync: cancelListing } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });
    // --- 新增功能：用于改价和暂停的写合约 hook ---
    const { writeContractAsync: writeMarketplace } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });

    const { data: yourCollectibleContract } = useScaffoldContract({ contractName: "YourCollectible" });

    // 仅展示与当前用户相关的上架记录
    const filteredActiveListings = useMemo(() => {
        const sellerLower = (connectedAddress || "").toLowerCase();
        const list = (activeListings as ListingWithId[] | undefined) ?? [];
        return list.filter(l => String(l.seller).toLowerCase() === sellerLower);
    }, [activeListings, connectedAddress]);

    // 使用稳定 key 作为依赖
    const listingsKey = useMemo(() => filteredActiveListings.map(l => String(l.listingId)).join(","), [filteredActiveListings]);

    useEffect(() => {
        if (!yourCollectibleContract) return;

        let cancelled = false;

        const loadMetadata = async () => {
            try {
                setLoading(true);
                const result: MyListingItem[] = [];
                for (const l of filteredActiveListings) {
                    try {
                        // 仅处理我们合约的NFT
                        const tokenURI = await yourCollectibleContract.read.tokenURI([l.tokenId]);

                        // --- 保持当前文件健壮的 IPFS 解析逻辑 ---
                        let ipfsHash = tokenURI as string;
                        if (ipfsHash.includes("/ipfs/")) {
                            ipfsHash = ipfsHash.split("/ipfs/")[1];
                        } else if (ipfsHash.startsWith("ipfs://")) {
                            ipfsHash = ipfsHash.replace("ipfs://", "");
                        }

                        const metadata = await getMetadataFromIPFS(ipfsHash);
                        result.push({ ...l, metadata });
                    } catch (e) {
                        result.push({ ...l });
                    }
                }
                if (!cancelled) {
                    setMyListings(result);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        loadMetadata();

        return () => {
            cancelled = true;
        };
    }, [listingsKey]);

    const handleCancel = async (listingId: bigint) => {
        try {
            setCancellingId(listingId);
            await cancelListing({ functionName: "cancelListing", args: [listingId] });
            await refetchListings();
        } catch (e) {
            console.error("Cancel listing failed", e);
        } finally {
            setCancellingId(null);
        }
    };

    // --- 新增功能：改价函数 ---
    const handleUpdatePrice = async (listingId: bigint) => {
        const key = listingId.toString();
        const priceStr = editPrices[key];
        if (!priceStr) return;
        try {
            setUpdatingId(listingId);
            const newPrice = parseEther(priceStr as `${number}`);
            await writeMarketplace({ functionName: "updatePrice", args: [listingId, newPrice] });
            await refetchListings();
            setEditPrices(prev => ({ ...prev, [key]: "" }));
        } catch (e) {
            console.error("Update price failed", e);
        } finally {
            setUpdatingId(null);
        }
    };

    // --- 新增功能：暂停上架函数 ---
    const handlePauseListing = async (listingId: bigint) => {
        try {
            setPausingId(listingId);
            await writeMarketplace({ functionName: "pauseListing", args: [listingId] });
            await refetchListings();
        } catch (e) {
            console.error("Pause listing failed", e);
        } finally {
            setPausingId(null);
        }
    };

    // --- 批量下架处理函数 ---
    const handleBulkCancel = async () => {
        if (selectedListingIds.length === 0) return;
        try {
            setIsBulkCancelling(true);
            setBulkProgress({ done: 0, total: selectedListingIds.length });
            for (let i = 0; i < selectedListingIds.length; i++) {
                const id = selectedListingIds[i];
                setBulkProgress({ done: i, total: selectedListingIds.length, current: id });
                await cancelListing({ functionName: "cancelListing", args: [id] });
            }
            setBulkProgress({ done: selectedListingIds.length, total: selectedListingIds.length });
            await refetchListings();
            setSelectedListingIds([]);
            setBulkMode(false);
        } catch (e) {
            console.error("Bulk cancel failed", e);
        } finally {
            setIsBulkCancelling(false);
        }
    };

    if (!connectedAddress) {
        return null;
    }

    return (
        <div className="px-5 mt-8">
            <h2 className="text-xl font-bold mb-4">我的上架记录</h2>

            {/* 批量下架控制面板 */}
            <div className="mb-4 flex flex-wrap gap-2 items-center">
                {!bulkMode ? (
                    <button className="btn btn-primary btn-sm" onClick={() => setBulkMode(true)}>
                        批量下架
                    </button>
                ) : (
                    <div className="flex flex-wrap gap-2 items-center w-full">
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setSelectedListingIds(myListings.map(i => i.listingId))}
                        >
                            全选全部
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => setSelectedListingIds([])}>
                            清空选择
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                                setBulkMode(false);
                                setSelectedListingIds([]);
                            }}
                        >
                            退出批量
                        </button>
                        <button
                            className="btn btn-error btn-sm"
                            disabled={isBulkCancelling || selectedListingIds.length === 0}
                            onClick={handleBulkCancel}
                        >
                            {isBulkCancelling ? (
                                <>
                                    <span className="loading loading-spinner loading-xs mr-1"></span>
                                    下架中...
                                </>
                            ) : (
                                <>下架选中({selectedListingIds.length})</>
                            )}
                        </button>
                        {isBulkCancelling && bulkProgress ? (
                            <span className="text-xs opacity-70">
                                进度 {bulkProgress.done}/{bulkProgress.total}
                            </span>
                        ) : null}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center items-center mt-6">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            ) : myListings.length === 0 ? (
                <div className="alert alert-info">
                    <span>当前没有活跃的上架记录。</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myListings.map(item => (
                        <div
                            key={String(item.listingId)}
                            className="card bg-base-100 shadow-xl border border-base-300 relative"
                        >
                            {/* 批量模式下的复选框 */}
                            {bulkMode ? (
                                <div className="absolute top-3 left-3 z-10">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-primary checkbox-sm"
                                        checked={selectedListingIds.includes(item.listingId)}
                                        onChange={e => {
                                            const checked = e.target.checked;
                                            setSelectedListingIds(prev => {
                                                const exists = prev.includes(item.listingId);
                                                if (checked) return exists ? prev : [...prev, item.listingId];
                                                return prev.filter(id => id !== item.listingId);
                                            });
                                        }}
                                    />
                                </div>
                            ) : null}

                            <figure className="h-48 overflow-hidden bg-base-200">
                                {/* eslint-disable-next-line */}
                                <img
                                    src={item.metadata?.image}
                                    alt={item.metadata?.name || `#${String(item.tokenId)}`}
                                    className="w-full h-full object-cover"
                                />
                            </figure>
                            <div className="card-body">
                                <div className="flex items-center justify-between">
                                    <h3 className="card-title text-lg">{item.metadata?.name || `Token #${String(item.tokenId)}`}</h3>
                                    <div className="badge badge-outline">#{String(item.tokenId)}</div>
                                </div>
                                {item.metadata?.description && (
                                    <p className="text-sm opacity-70 line-clamp-2">{item.metadata.description}</p>
                                )}
                                <div className="mt-2">
                                    <div className="text-sm">
                                        价格: <span className="font-semibold">{formatEther(item.price)} ETH</span>
                                    </div>
                                    <div className="text-xs opacity-70">上架ID: {String(item.listingId)}</div>
                                </div>

                                {/* --- 新增功能：操作面板 (替换了旧的单一 Cancel 按钮) --- */}
                                <div className="mt-3 p-3 bg-base-200 rounded-lg space-y-2">
                                    {/* 改价部分 */}
                                    <div className="flex items-center gap-2">
                                        <input
                                            className="input input-bordered input-sm flex-1"
                                            placeholder="新价格 (ETH)"
                                            value={editPrices[item.listingId.toString()] || ""}
                                            onChange={e =>
                                                setEditPrices(prev => ({ ...prev, [item.listingId.toString()]: e.target.value }))
                                            }
                                        />
                                        <button
                                            className="btn btn-sm btn-primary"
                                            disabled={updatingId === item.listingId}
                                            onClick={() => handleUpdatePrice(item.listingId)}
                                        >
                                            {updatingId === item.listingId ? (
                                                <>
                                                    <span className="loading loading-spinner loading-xs mr-1"></span>
                                                    改价中...
                                                </>
                                            ) : (
                                                <>改价</>
                                            )}
                                        </button>
                                    </div>

                                    {/* 暂停与下架部分 */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            className="btn btn-sm btn-warning flex-1"
                                            disabled={pausingId === item.listingId}
                                            onClick={() => handlePauseListing(item.listingId)}
                                        >
                                            {pausingId === item.listingId ? (
                                                <>
                                                    <span className="loading loading-spinner loading-xs mr-1"></span>
                                                    暂停中...
                                                </>
                                            ) : (
                                                <>暂停上架</>
                                            )}
                                        </button>
                                        <button
                                            className="btn btn-error btn-sm"
                                            disabled={cancellingId === item.listingId}
                                            onClick={() => handleCancel(item.listingId)}
                                        >
                                            {cancellingId === item.listingId ? (
                                                <>
                                                    <span className="loading loading-spinner loading-xs mr-1"></span>
                                                    取消中...
                                                </>
                                            ) : (
                                                <>下架</>
                                            )}
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};