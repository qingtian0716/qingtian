"use client";

import { useEffect, useMemo, useState } from "react";
import { NFTCard } from "./NFTCard";
import { useAccount } from "wagmi";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
// --- 新增 import: 写合约 hook 和工具 ---
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { parseEther } from "viem";
import { notification } from "~~/utils/scaffold-eth";
import { getMetadataFromIPFS } from "~~/utils/simpleNFT/ipfs-fetch";
import { NFTMetaData } from "~~/utils/simpleNFT/nftsMetadata";

export interface Collectible extends Partial<NFTMetaData> {
  id: number;
  uri: string;
  owner: string;
}

export const MyHoldings = () => {
  const { address: connectedAddress } = useAccount();
  const [myAllCollectibles, setMyAllCollectibles] = useState<Collectible[]>([]);
  const [allCollectiblesLoading, setAllCollectiblesLoading] = useState(false);

  // --- 搜索 & 分页状态 ---
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // --- 新增功能：批量模式状态 ---
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkPrice, setBulkPrice] = useState("");
  const [isBulkListing, setIsBulkListing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ listed: number; total: number; currentTokenId?: number }>();

  const { data: yourCollectibleContract } = useScaffoldContract({
    contractName: "YourCollectible",
  });

  // --- 新增功能：批量上架所需写合约方法与地址 ---
  const { writeContractAsync: writeCollectible } = useScaffoldWriteContract({ contractName: "YourCollectible" });
  const { writeContractAsync: writeMarketplace } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });
  const nftContractAddress = process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS || "0x0";
  const marketplaceAddress = process.env.NEXT_PUBLIC_NFT_MARKETPLACE_ADDRESS || "0x0";

  const { data: myTotalBalance } = useScaffoldReadContract({
    contractName: "YourCollectible",
    functionName: "balanceOf",
    args: [connectedAddress],
    watch: true,
  });

  useEffect(() => {
    const updateMyCollectibles = async (): Promise<void> => {
      if (myTotalBalance === undefined || yourCollectibleContract === undefined || connectedAddress === undefined)
        return;

      setAllCollectiblesLoading(true);
      const collectibleUpdate: Collectible[] = [];
      const totalBalance = parseInt(myTotalBalance.toString());
      for (let tokenIndex = 0; tokenIndex < totalBalance; tokenIndex++) {
        try {
          const tokenId = await yourCollectibleContract.read.tokenOfOwnerByIndex([
            connectedAddress,
            BigInt(tokenIndex),
          ]);

          const tokenURI = await yourCollectibleContract.read.tokenURI([tokenId]);

          // --- 关键：保留你当前文件更稳健的 IPFS 解析逻辑 ---
          // 不要使用新文件中的 .replace() 写法，防止破坏现有功能
          let ipfsHash = tokenURI as string;
          if (ipfsHash.includes("/ipfs/")) {
            ipfsHash = ipfsHash.split("/ipfs/")[1];
          } else if (ipfsHash.startsWith("ipfs://")) {
            ipfsHash = ipfsHash.replace("ipfs://", "");
          }

          const nftMetadata: NFTMetaData = await getMetadataFromIPFS(ipfsHash);

          collectibleUpdate.push({
            id: parseInt(tokenId.toString()),
            uri: tokenURI,
            owner: connectedAddress,
            ...nftMetadata,
          });
        } catch (e) {
          notification.error("Error fetching all collectibles");
          setAllCollectiblesLoading(false);
          console.log(e);
        }
      }
      collectibleUpdate.sort((a, b) => a.id - b.id);
      setMyAllCollectibles(collectibleUpdate);
      setAllCollectiblesLoading(false);
      // 重置分页
      setCurrentPage(1);
      // 新增：数据更新时重置批量选择
      setSelectedIds([]);
    };

    updateMyCollectibles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, myTotalBalance]);

  // --- 根据搜索过滤 ---
  const filteredCollectibles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return myAllCollectibles;
    return myAllCollectibles.filter(item => {
      const name = (item.name || "").toLowerCase();
      const desc = (item.description || "").toLowerCase();
      const idStr = String(item.id);
      return name.includes(q) || desc.includes(q) || idStr.includes(q);
    });
  }, [myAllCollectibles, searchQuery]);

  // --- 分页切片 ---
  const pageCount = Math.max(1, Math.ceil(filteredCollectibles.length / pageSize));
  const currentPageSafe = Math.min(currentPage, pageCount);
  const startIndex = (currentPageSafe - 1) * pageSize;
  const pageItems = filteredCollectibles.slice(startIndex, startIndex + pageSize);

  // --- 搜索输入处理 ---
  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  // --- 分页控制 ---
  const gotoPage = (p: number) => {
    const next = Math.max(1, Math.min(p, pageCount));
    setCurrentPage(next);
  };

  // --- 新增功能：批量上架逻辑 ---
  const handleBulkList = async () => {
    if (selectedIds.length === 0 || !bulkPrice || parseFloat(bulkPrice) <= 0) {
      notification.warning("请选择NFT并输入有效价格");
      return;
    }
    try {
      setIsBulkListing(true);
      setBulkProgress({ listed: 0, total: selectedIds.length });

      // 1. 授权
      await writeCollectible({
        functionName: "setApprovalForAll",
        args: [marketplaceAddress, true],
      });

      // 2. 逐个上架
      for (let i = 0; i < selectedIds.length; i++) {
        const tokenId = BigInt(selectedIds[i]);
        setBulkProgress({ listed: i, total: selectedIds.length, currentTokenId: selectedIds[i] });
        await writeMarketplace({
          functionName: "listNFT",
          args: [nftContractAddress, tokenId, parseEther(bulkPrice)],
        });
      }

      setBulkProgress({ listed: selectedIds.length, total: selectedIds.length });
      notification.success("批量上架成功");
      setSelectedIds([]);
      setBulkPrice("");
      setBulkMode(false);
    } catch (e: any) {
      console.error("Bulk listing error", e);
      notification.error(e?.message ? `批量上架失败: ${e.message}` : "批量上架失败，请重试");
    } finally {
      setIsBulkListing(false);
    }
  };

  if (allCollectiblesLoading)
    return (
      <div className="flex justify-center items-center mt-10">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );

  return (
    <>
      {/* 搜索与统计栏 */}
      <div className="px-5 mt-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="form-control w-full md:w-80">
          <input
            className="input input-bordered"
            placeholder="搜索名称、描述或ID"
            value={searchQuery}
            onChange={onSearchChange}
          />
        </div>
        <div className="text-sm opacity-70">
          共 {filteredCollectibles.length} / {myAllCollectibles.length} 项
        </div>
      </div>

      {/* --- 新增功能：批量上架控制面板 --- */}
      <div className="px-5 mt-2 flex flex-wrap gap-3 items-center justify-between">
        {!bulkMode ? (
          <button className="btn btn-primary btn-sm" onClick={() => setBulkMode(true)}>
            批量上架
          </button>
        ) : (
          <div className="flex flex-wrap gap-2 items-center w-full">
            <input
              type="number"
              min="0"
              step="0.001"
              placeholder="统一价格(ETH)"
              className="input input-bordered input-sm w-40"
              value={bulkPrice}
              onChange={e => setBulkPrice(e.target.value)}
            />
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedIds(pageItems.map(i => i.id))}>
              全选本页
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedIds([])}>
              清空选择
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setBulkMode(false);
                setSelectedIds([]);
              }}
            >
              退出批量
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={isBulkListing || selectedIds.length === 0 || !bulkPrice || parseFloat(bulkPrice) <= 0}
              onClick={handleBulkList}
            >
              {isBulkListing ? (
                <>
                  <span className="loading loading-spinner loading-xs mr-1"></span>
                  上架中...
                </>
              ) : (
                <>上架选中({selectedIds.length})</>
              )}
            </button>
            {isBulkListing && bulkProgress ? (
              <span className="text-xs opacity-70">
                进度 {bulkProgress.listed}/{bulkProgress.total}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {filteredCollectibles.length === 0 ? (
        <div className="flex justify-center items-center mt-10">
          <div className="text-2xl text-primary-content">
            {myAllCollectibles.length === 0 ? "No NFTs found" : "未找到匹配的NFT"}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 my-6 px-5 justify-center">
            {pageItems.map(item => (
              <NFTCard
                nft={item}
                key={item.id}
                // --- 新增功能：传递选择状态给 Card ---
                selectable={bulkMode}
                selected={selectedIds.includes(item.id)}
                onSelectedChange={checked => {
                  setSelectedIds(prev => {
                    const exists = prev.includes(item.id);
                    if (checked) {
                      return exists ? prev : [...prev, item.id];
                    }
                    return prev.filter(id => id !== item.id);
                  });
                }}
              />
            ))}
          </div>

          {/* 分页控件 */}
          <div className="join flex justify-center my-6 px-5">
            <button
              className="join-item btn"
              onClick={() => gotoPage(currentPageSafe - 1)}
              disabled={currentPageSafe <= 1}
            >
              «
            </button>
            <button className="join-item btn">
              第 {currentPageSafe} / {pageCount} 页
            </button>
            <button
              className="join-item btn"
              onClick={() => gotoPage(currentPageSafe + 1)}
              disabled={currentPageSafe >= pageCount}
            >
              »
            </button>
          </div>
        </>
      )}
    </>
  );
};