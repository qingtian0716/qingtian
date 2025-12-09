"use client";

import { useMemo } from "react";
import { formatEther } from "viem";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface MarketplaceListing {
    listingId: bigint;
    tokenId: bigint;
    seller: string;
    price: bigint;
    active: boolean;
    nftContract: string;
}

interface CollectionStat {
    contract: string;
    count: number;
    floor: bigint;
    ceiling: bigint;
    avg: bigint;
    sellerCount: number;
}

export default function CollectionsPage() {
    const { data: activeListings } = useScaffoldReadContract({
        contractName: "NFTMarketplace",
        functionName: "getAllActiveListings",
    });

    const stats = useMemo<CollectionStat[]>(() => {
        if (!activeListings || (activeListings as MarketplaceListing[]).length === 0) return [];
        const byContract = new Map<string, MarketplaceListing[]>();
        for (const l of activeListings as MarketplaceListing[]) {
            const arr = byContract.get(l.nftContract) ?? [];
            arr.push(l);
            byContract.set(l.nftContract, arr);
        }
        const out: CollectionStat[] = [];
        for (const [contract, arr] of byContract.entries()) {
            let floor: bigint | null = null;
            let ceiling: bigint | null = null;
            let sum = 0n;
            const sellers = new Set<string>();
            for (const l of arr) {
                sellers.add(l.seller.toLowerCase());
                sum += l.price;
                floor = floor === null ? l.price : (l.price < floor ? l.price : floor);
                ceiling = ceiling === null ? l.price : (l.price > ceiling ? l.price : ceiling);
            }
            const count = arr.length;
            const avg = count > 0 ? sum / BigInt(count) : 0n;
            out.push({ contract, count, floor: floor ?? 0n, ceiling: ceiling ?? 0n, avg, sellerCount: sellers.size });
        }
        // 按照地板价升序
        out.sort((a, b) => (a.floor < b.floor ? -1 : a.floor > b.floor ? 1 : 0));
        return out;
    }, [activeListings]);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold mb-4">Collections</h1>
                <p className="text-lg opacity-70">按合约地址聚合的在售 NFT 统计</p>
            </div>

            {!activeListings || (activeListings as MarketplaceListing[]).length === 0 ? (
                <div className="text-center py-16">
                    <div className="text-6xl mb-4">🧩</div>
                    <h2 className="text-2xl font-bold mb-2">暂无在售列表</h2>
                    <p className="text-lg opacity-70">去 Marketplace 上架或购买吧</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {stats.map((c) => (
                        <div key={c.contract} className="card bg-base-100 shadow-xl border border-base-300">
                            <div className="card-body p-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold opacity-70">Contract</span>
                                    <Address address={c.contract} size="sm" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="opacity-70">在售数量</span>
                                        <span className="font-bold">{c.count}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="opacity-70">卖家数</span>
                                        <span className="font-bold">{c.sellerCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="opacity-70">地板价</span>
                                        <span className="font-bold text-primary">{formatEther(c.floor)} ETH</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="opacity-70">最高价</span>
                                        <span className="font-bold">{formatEther(c.ceiling)} ETH</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="opacity-70">均价</span>
                                        <span className="font-bold">{formatEther(c.avg)} ETH</span>
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <a className="btn btn-primary btn-sm w-full" href={`/marketplace?contract=${c.contract}`}>
                                        查看该合约在市场
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}