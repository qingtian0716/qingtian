"use client";
import { useEffect, useMemo, useState } from "react";
import { parseEther, encodeAbiParameters, keccak256, toHex } from "viem";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

type BlindAuction = {
    id: bigint;
    seller: `0x${string}`;
    nftAddress: `0x${string}`;
    tokenId: bigint;
    minBid: bigint;
    commitEndTime: bigint;
    revealEndTime: bigint;
    finalized: boolean;
    winner?: `0x${string}`;
    highestBid?: bigint;
};

type NFTMetadata = {
    name?: string;
    description?: string;
    image?: string;
    attributes?: Array<{ trait_type: string; value: string }>;
};

function formatTime(ts?: bigint) {
    if (!ts) return "-";
    const d = new Date(Number(ts) * 1000);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export default function BlindAuctionsPage() {
    const { address } = useAccount();
    const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));
    useEffect(() => {
        const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(t);
    }, []);

    const { data: auctionsData, isLoading: isLoadingAuctions, refetch } = useScaffoldReadContract({
        contractName: "NFTMarketplace",
        functionName: "getAllActiveBlindAuctions",
    });

    // 跳过 simulateContract 以避免因最新区块时间未更新造成的时间窗口误判（如揭示/结算期）
    const { writeContractAsync: writeMarketplace } = useScaffoldWriteContract({ contractName: "NFTMarketplace", disableSimulate: true });

    const auctions: BlindAuction[] = useMemo(() => {
        if (!auctionsData) return [] as BlindAuction[];
        const arr = Array.isArray(auctionsData) ? (auctionsData as any[]) : [];
        const normalizeBigInt = (v: any) => (typeof v === "bigint" ? v : v !== undefined ? BigInt(v) : undefined);
        return arr
            .map((a: any) => {
                const idRaw = a.auctionId ?? a.id ?? (Array.isArray(a) ? a[0] : undefined);
                const tokenIdRaw = a.tokenId ?? (Array.isArray(a) ? a[2] ?? a[3] : undefined);
                const minBidRaw = a.minBid ?? (Array.isArray(a) ? a[4] : undefined);
                const commitEndRaw = a.commitEnd ?? a.commitEndTime ?? (Array.isArray(a) ? a[5] : undefined);
                const revealEndRaw = a.revealEnd ?? a.revealEndTime ?? (Array.isArray(a) ? a[6] : undefined);

                const id = normalizeBigInt(idRaw);
                const tokenId = normalizeBigInt(tokenIdRaw);
                const minBid = normalizeBigInt(minBidRaw);
                const commitEndTime = normalizeBigInt(commitEndRaw);
                const revealEndTime = normalizeBigInt(revealEndRaw);

                if (
                    id === undefined ||
                    tokenId === undefined ||
                    minBid === undefined ||
                    commitEndTime === undefined ||
                    revealEndTime === undefined
                ) {
                    return null;
                }

                return {
                    id,
                    seller: a.seller ?? (Array.isArray(a) ? a[3] ?? a[1] : undefined),
                    nftAddress: a.nftContract ?? a.nftAddress ?? (Array.isArray(a) ? a[1] ?? a[2] : undefined),
                    tokenId,
                    minBid,
                    commitEndTime,
                    revealEndTime,
                    finalized: Boolean(a.finalized ?? (Array.isArray(a) ? a[8] : false)),
                    winner: a.highestBidder ?? a.winner ?? (Array.isArray(a) ? a[9] : undefined),
                    highestBid: normalizeBigInt(a.highestBid ?? (Array.isArray(a) ? a[10] : undefined)),
                } as BlindAuction;
            })
            .filter(Boolean) as BlindAuction[];
    }, [auctionsData]);

    const [commitAmounts, setCommitAmounts] = useState<Record<string, string>>({});
    const [commitSecrets, setCommitSecrets] = useState<Record<string, string>>({});
    const [revealAmounts, setRevealAmounts] = useState<Record<string, string>>({});
    const [revealSecrets, setRevealSecrets] = useState<Record<string, string>>({});
    const [pendingId, setPendingId] = useState<string>("");

    // 盲拍NFT元数据缓存：tokenId -> metadata
    const [nftMetas, setNftMetas] = useState<Record<string, NFTMetadata | undefined>>({});
    useEffect(() => {
        const loadMetas = async () => {
            if (!auctions || auctions.length === 0) return;
            const missing = auctions.filter(a => !nftMetas[a.tokenId.toString()]);
            if (missing.length === 0) return;
            const results = await Promise.all(
                missing.map(async a => {
                    try {
                        const res = await fetch(`/api/nft/metadata/${a.tokenId}`);
                        if (res.ok) {
                            const meta = (await res.json()) as NFTMetadata;
                            return { key: a.tokenId.toString(), meta } as { key: string; meta: NFTMetadata };
                        }
                    } catch (e) {
                        console.error("Failed to fetch metadata for", a.tokenId.toString(), e);
                    }
                    return { key: a.tokenId.toString(), meta: undefined } as { key: string; meta: NFTMetadata | undefined };
                })
            );
            setNftMetas(prev => {
                const next = { ...prev };
                for (const r of results) next[r.key] = r.meta;
                return next;
            });
        };
        loadMetas();
    }, [auctions]);

    const onCommit = async (auctionId: bigint) => {
        const key = auctionId.toString();
        const amount = commitAmounts[key];
        const secretText = commitSecrets[key];
        if (!amount || parseFloat(amount) <= 0) {
            alert("请输入有效的出价金额");
            return;
        }
        if (!secretText || secretText.length < 3) {
            alert("请输入用于生成承诺的密语");
            return;
        }
        try {
            setPendingId(key);
            const amountWei = parseEther(amount);
            const secretBytes32 = keccak256(toHex(secretText));
            const commitment = keccak256(
                encodeAbiParameters(
                    [
                        { type: "uint256" },
                        { type: "bytes32" },
                        { type: "address" },
                    ],
                    [amountWei, secretBytes32, address!]
                )
            );

            // 保存用于揭示
            localStorage.setItem(`blind-secret-${key}`, secretText);
            localStorage.setItem(`blind-amount-${key}`, amount);

            await writeMarketplace({
                functionName: "commitBlindBid",
                args: [auctionId, commitment],
            });
            alert("提交成功！请在揭示期进行揭示并支付出价金额");
            refetch();
        } catch (e) {
            console.error(e);
            alert("提交失败，请重试");
        } finally {
            setPendingId("");
        }
    };

    const onReveal = async (auctionId: bigint) => {
        const key = auctionId.toString();
        const amount = revealAmounts[key] || localStorage.getItem(`blind-amount-${key}`) || "";
        const secretText = revealSecrets[key] || localStorage.getItem(`blind-secret-${key}`) || "";
        if (!amount || parseFloat(amount) <= 0) {
            alert("请输入有效的出价金额（与提交期一致）");
            return;
        }
        if (!secretText) {
            alert("请输入或找回提交时保存的密语");
            return;
        }
        try {
            setPendingId(key);
            const amountWei = parseEther(amount);
            const secretBytes32 = keccak256(toHex(secretText));
            await writeMarketplace({
                functionName: "revealBlindBid",
                args: [auctionId, amountWei, secretBytes32],
                value: amountWei,
            });
            alert("揭示成功，已锁定您的出价金额");
            refetch();
        } catch (e) {
            console.error(e);
            alert("揭示失败，请重试");
        } finally {
            setPendingId("");
        }
    };

    const onFinalize = async (auctionId: bigint) => {
        try {
            setPendingId(auctionId.toString());
            await writeMarketplace({ functionName: "finalizeBlindAuction", args: [auctionId] });
            alert("已结算盲拍，NFT 将转移给最高出价者");
            refetch();
        } catch (e) {
            console.error(e);
            alert("结算失败，请重试");
        } finally {
            setPendingId("");
        }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">盲拍市场</h1>
                <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>刷新</button>
            </div>

            {isLoadingAuctions ? (
                <div className="flex items-center gap-2"><span className="loading loading-spinner loading-sm"></span> 加载中...</div>
            ) : auctions.length === 0 ? (
                <div className="alert alert-info">当前没有进行中的盲拍</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {auctions.map(a => {
                        const phase = a.finalized
                            ? "已结束"
                            : now < Number(a.commitEndTime)
                                ? "提交期"
                                : now < Number(a.revealEndTime)
                                    ? "揭示期"
                                    : "待结算";
                        const key = a.id.toString();
                        const meta = nftMetas[a.tokenId.toString()];
                        return (
                            <div key={key} className="card bg-base-100 border border-base-300">
                                {/* 图片区 */}
                                <figure className="relative overflow-hidden">
                                    {meta?.image ? (
                                        <img
                                            src={meta.image}
                                            alt={meta?.name || `NFT #${a.tokenId.toString()}`}
                                            className="h-64 w-full object-cover"
                                        />
                                    ) : (
                                        <div className="h-64 w-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                                            <span className="text-4xl">🖼️</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                                    <figcaption className="absolute bottom-3 left-3 bg-black/60 text-white px-3 py-1 rounded">
                                        <span className="font-bold">#{a.tokenId.toString()}</span>
                                    </figcaption>
                                </figure>

                                <div className="card-body">
                                    <div className="flex items-center justify-between">
                                        <div className="font-semibold">拍卖 #{key}</div>
                                        <div className="badge badge-outline">{phase}</div>
                                    </div>
                                    {/* 名称与基本信息 */}
                                    <div className="text-sm opacity-70">NFT: <Address address={a.nftAddress} size="sm" /> · Token #{a.tokenId.toString()}</div>
                                    {meta?.name && (
                                        <div className="text-sm font-semibold">{meta.name}</div>
                                    )}
                                    <div className="text-sm">卖家: <Address address={a.seller} size="sm" /></div>
                                    <div className="text-sm">最低出价: {Number(a.minBid) / 1e18} ETH</div>
                                    <div className="text-xs opacity-60">提交截止: {formatTime(a.commitEndTime)}</div>
                                    <div className="text-xs opacity-60">揭示截止: {formatTime(a.revealEndTime)}</div>

                                    {phase === "提交期" && (
                                        <div className="mt-3 space-y-2">
                                            <input
                                                type="number"
                                                step="0.001"
                                                min={Number(a.minBid) / 1e18}
                                                placeholder={`出价金额 ≥ ${Number(a.minBid) / 1e18} ETH`}
                                                className="input input-bordered input-sm w-full"
                                                value={commitAmounts[key] || ""}
                                                onChange={e => setCommitAmounts(s => ({ ...s, [key]: e.target.value }))}
                                            />
                                            <input
                                                type="text"
                                                placeholder="输入一个密语（用于生成承诺）"
                                                className="input input-bordered input-sm w-full"
                                                value={commitSecrets[key] || ""}
                                                onChange={e => setCommitSecrets(s => ({ ...s, [key]: e.target.value }))}
                                            />
                                            <button
                                                className="btn btn-primary btn-sm w-full"
                                                disabled={pendingId === key}
                                                onClick={() => onCommit(a.id)}
                                            >
                                                {pendingId === key ? (<span className="loading loading-spinner loading-xs"></span>) : "提交出价承诺"}
                                            </button>
                                            <div className="text-xs opacity-60">提示：提交期不需要支付 ETH，仅记录承诺。</div>
                                        </div>
                                    )}

                                    {phase === "揭示期" && (
                                        <div className="mt-3 space-y-2">
                                            <input
                                                type="number"
                                                step="0.001"
                                                min={Number(a.minBid) / 1e18}
                                                placeholder="揭示出价金额（需与提交一致）"
                                                className="input input-bordered input-sm w-full"
                                                value={revealAmounts[key] || ""}
                                                onChange={e => setRevealAmounts(s => ({ ...s, [key]: e.target.value }))}
                                            />
                                            <input
                                                type="text"
                                                placeholder="提交期的密语（用于验证承诺）"
                                                className="input input-bordered input-sm w-full"
                                                value={revealSecrets[key] || ""}
                                                onChange={e => setRevealSecrets(s => ({ ...s, [key]: e.target.value }))}
                                            />
                                            <button
                                                className="btn btn-secondary btn-sm w-full"
                                                disabled={pendingId === key}
                                                onClick={() => onReveal(a.id)}
                                            >
                                                {pendingId === key ? (<span className="loading loading-spinner loading-xs"></span>) : "揭示并支付"}
                                            </button>
                                            <div className="text-xs opacity-60">提示：揭示时将支付您的出价金额（ETH）。</div>
                                        </div>
                                    )}

                                    {phase === "待结算" && (
                                        <div className="mt-3">
                                            {address?.toLowerCase() === a.seller.toLowerCase() ? (
                                                <button className="btn btn-accent btn-sm w-full" disabled={pendingId === key} onClick={() => onFinalize(a.id)}>
                                                    {pendingId === key ? (<span className="loading loading-spinner loading-xs"></span>) : "结算盲拍"}
                                                </button>
                                            ) : (
                                                <div className="alert alert-warning text-sm">等待卖家结算</div>
                                            )}
                                        </div>
                                    )}

                                    {a.finalized && (
                                        <div className="mt-3 text-sm">
                                            {a.winner ? (
                                                <span>胜者：<Address address={a.winner} size="sm" /> · 最高出价：{(Number(a.highestBid || 0n) / 1e18)} ETH</span>
                                            ) : (
                                                <span>未揭示有效出价或无人参与</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}