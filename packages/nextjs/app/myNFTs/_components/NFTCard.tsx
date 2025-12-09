import { useState } from "react";
import { parseEther } from "viem";
import { Collectible } from "./MyHoldings";
import { Address, AddressInput } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
// --- 新增 Import: 用于获取部署合约信息 ---
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";

export const NFTCard = ({
  nft,
  selectable,
  selected,
  onSelectedChange
}: {
  nft: Collectible;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (checked: boolean) => void;
}) => {
  const [transferToAddress, setTransferToAddress] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [isListing, setIsListing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // --- 新增状态: 盲拍相关 ---
  const [showBlind, setShowBlind] = useState(false);
  const [minBid, setMinBid] = useState("");
  const [commitDuration, setCommitDuration] = useState("3600");
  const [revealDuration, setRevealDuration] = useState("1800");
  const [isCreatingBlind, setIsCreatingBlind] = useState(false);

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });
  const { writeContractAsync: writeMarketplaceContract } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });

  // --- 新增 Hook: 获取合约信息 (用于盲拍) ---
  const { data: marketplaceInfo } = useDeployedContractInfo({ contractName: "NFTMarketplace" });
  const { data: collectibleInfo } = useDeployedContractInfo({ contractName: "YourCollectible" });

  // --- 原有逻辑: 检查 NFT 是否有上架记录 ---
  const nftContractAddress = process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS || "0x0";
  const { data: existingListingId } = useScaffoldReadContract({
    contractName: "NFTMarketplace",
    functionName: "getActiveListing",
    args: [nftContractAddress as `0x${string}`, BigInt(nft.id.toString())],
  });

  // --- 原有逻辑: 获取 listing 详情 ---
  const { data: listingDetails } = useScaffoldReadContract({
    contractName: "NFTMarketplace",
    functionName: "listings",
    args: [existingListingId ?? 0n],
    query: {
      enabled: existingListingId !== undefined && existingListingId > 0n,
    },
  });

  // --- 原有逻辑: 判断是否暂停 ---
  const hasPausedListing = existingListingId !== undefined &&
    existingListingId > 0n &&
    listingDetails !== undefined &&
    (listingDetails as any)?.[4] === false;

  // --- 原有功能: 恢复上架 ---
  const handleResumeListing = async () => {
    if (!existingListingId) return;
    try {
      setIsResuming(true);
      await writeContractAsync({
        functionName: "approve",
        args: [process.env.NEXT_PUBLIC_NFT_MARKETPLACE_ADDRESS || "0x0", BigInt(nft.id.toString())],
      });
      await writeMarketplaceContract({
        functionName: "resumeListing",
        args: [existingListingId],
      });
      alert("NFT 已成功恢复上架！");
    } catch (err) {
      console.error("Error resuming listing:", err);
      alert("恢复上架失败，请重试");
    } finally {
      setIsResuming(false);
    }
  };

  // --- 共同功能: 普通上架 (Sell) ---
  const handleSellNFT = async () => {
    if (!sellPrice || parseFloat(sellPrice) <= 0) {
      alert("请输入有效的价格");
      return;
    }

    try {
      setIsListing(true);
      await writeContractAsync({
        functionName: "approve",
        args: [process.env.NEXT_PUBLIC_NFT_MARKETPLACE_ADDRESS || "0x0", BigInt(nft.id.toString())],
      });
      await writeMarketplaceContract({
        functionName: "listNFT",
        args: [
          process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS || "0x0",
          BigInt(nft.id.toString()),
          parseEther(sellPrice)
        ],
      });
      setShowSell(false);
      setSellPrice("");
      alert("NFT 已成功上架到市场！");
    } catch (err) {
      console.error("Error listing NFT:", err);
      alert("上架失败，请重试");
    } finally {
      setIsListing(false);
    }
  };

  // --- 新增功能: 创建盲拍 ---
  const handleCreateBlindAuction = async () => {
    if (!minBid || parseFloat(minBid) <= 0) {
      alert("请输入有效的最低出价");
      return;
    }
    if (!commitDuration || !revealDuration) {
      alert("请输入有效的提交/揭示时间");
      return;
    }

    try {
      setIsCreatingBlind(true);
      const marketplaceAddress = marketplaceInfo?.address;
      if (!marketplaceAddress) {
        throw new Error("无法获取市场合约地址，请检查部署或网络配置");
      }
      // 授权
      await writeContractAsync({
        functionName: "approve",
        args: [marketplaceAddress, BigInt(nft.id.toString())],
      });

      // 创建盲拍
      await writeMarketplaceContract({
        functionName: "createBlindAuction",
        args: [
          (() => {
            const envAddr = process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS as `0x${string}` | undefined;
            const resolved = (collectibleInfo?.address as `0x${string}` | undefined) || envAddr;
            if (!resolved) throw new Error("无法获取NFT合约地址，请检查部署或环境变量");
            return resolved;
          })(),
          BigInt(nft.id.toString()),
          parseEther(minBid),
          BigInt(commitDuration),
          BigInt(revealDuration),
        ],
      });

      setShowBlind(false);
      setMinBid("");
      setCommitDuration("3600");
      setRevealDuration("1800");
      alert("盲拍创建成功！请至盲拍市场查看");
    } catch (err) {
      console.error("Error creating blind auction:", err);
      alert("盲拍创建失败，请重试");
    } finally {
      setIsCreatingBlind(false);
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 border border-base-300 overflow-hidden group relative">
      {/* 选择复选框（批量模式） */}
      {selectable ? (
        <div className="absolute top-3 left-3 z-10">
          <input
            type="checkbox"
            className="checkbox checkbox-primary checkbox-sm"
            checked={!!selected}
            onChange={(e) => onSelectedChange?.(e.target.checked)}
          />
        </div>
      ) : null}

      <figure className="relative overflow-hidden">
        {/* eslint-disable-next-line  */}
        <img
          src={nft.image}
          alt="NFT Image"
          className="h-64 w-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <figcaption className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded-lg">
          <span className="font-bold">#{nft.id}</span>
        </figcaption>
        {nft.attributes && nft.attributes.length > 0 && (
          <div className="absolute top-4 right-4">
            <div className="badge badge-primary badge-sm">
              {nft.attributes[0]?.value}
            </div>
          </div>
        )}
      </figure>

      <div className="card-body p-6">
        <div className="mb-4">
          <h3 className="card-title text-xl font-bold mb-2 line-clamp-1">{nft.name}</h3>
          <p className="text-sm opacity-70 line-clamp-2">{nft.description}</p>
        </div>

        {nft.attributes && nft.attributes.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {nft.attributes.slice(0, 3).map((attr, index) => (
                <div key={index} className="badge badge-outline badge-sm">
                  <span className="text-xs">{attr.trait_type}: {attr.value}</span>
                </div>
              ))}
              {nft.attributes.length > 3 && (
                <div className="badge badge-ghost badge-sm">
                  +{nft.attributes.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-4 p-3 bg-base-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold opacity-70">Owner</span>
            <Address address={nft.owner} size="sm" />
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="card-actions flex-col">
          {/* 原功能：暂停提示 */}
          {hasPausedListing && !showTransfer && !showSell && !showBlind && (
            <div className="alert alert-warning mb-2">
              <span className="text-sm">此 NFT 有暂停的上架记录</span>
            </div>
          )}

          {/* 按钮组逻辑：未点击任何操作按钮时显示 */}
          {!showTransfer && !showSell && !showBlind ? (
            <div className="flex gap-2 w-full">
              {/* Transfer 按钮 (所有状态通用) */}
              <button
                className="btn btn-outline btn-sm flex-1"
                onClick={() => setShowTransfer(true)}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer
              </button>

              {/* 原功能逻辑：如果暂停，显示恢复按钮；否则显示 Sell 和 盲拍 */}
              {hasPausedListing ? (
                <button
                  className="btn btn-success btn-sm flex-1"
                  onClick={handleResumeListing}
                  disabled={isResuming}
                >
                  {isResuming ? (
                    <>
                      <span className="loading loading-spinner loading-xs mr-1"></span>
                      恢复中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      恢复上架
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-primary btn-sm flex-1"
                    onClick={() => setShowSell(true)}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                    Sell
                  </button>
                  {/* 新增功能按钮：盲拍上架 */}
                  <button
                    className="btn btn-secondary btn-sm flex-1"
                    onClick={() => setShowBlind(true)}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
                    </svg>
                    盲拍
                  </button>
                </>
              )}
            </div>
          ) : showTransfer ? (
            // Transfer 表单
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-semibold">Transfer to:</span>
                </label>
                <AddressInput
                  value={transferToAddress}
                  placeholder="Enter recipient address"
                  onChange={newValue => setTransferToAddress(newValue)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowTransfer(false);
                    setTransferToAddress("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm flex-1"
                  disabled={!transferToAddress}
                  onClick={() => {
                    try {
                      writeContractAsync({
                        functionName: "transferFrom",
                        args: [nft.owner, transferToAddress, BigInt(nft.id.toString())],
                      });
                      setShowTransfer(false);
                      setTransferToAddress("");
                    } catch (err) {
                      console.error("Error calling transferFrom function", err);
                    }
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          ) : showSell ? (
            // Sell (一口价) 表单
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-semibold">Sale Price (ETH):</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Enter price in ETH"
                  className="input input-bordered input-sm w-full"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowSell(false);
                    setSellPrice("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm flex-1"
                  disabled={!sellPrice || parseFloat(sellPrice) <= 0 || isListing}
                  onClick={handleSellNFT}
                >
                  {isListing ? (
                    <>
                      <span className="loading loading-spinner loading-xs mr-1"></span>
                      Listing...
                    </>
                  ) : (
                    "List for Sale"
                  )}
                </button>
              </div>
            </div>
          ) : showBlind ? (
            // --- 新增功能: 盲拍表单 ---
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-semibold">最低出价 (ETH):</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="输入最低出价"
                  className="input input-bordered input-sm w-full"
                  value={minBid}
                  onChange={(e) => setMinBid(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-sm font-semibold">提交期 (秒):</span>
                  </label>
                  <input
                    type="number"
                    min="60"
                    placeholder="例如 3600"
                    className="input input-bordered input-sm w-full"
                    value={commitDuration}
                    onChange={(e) => setCommitDuration(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-sm font-semibold">揭示期 (秒):</span>
                  </label>
                  <input
                    type="number"
                    min="300"
                    placeholder="例如 1800"
                    className="input input-bordered input-sm w-full"
                    value={revealDuration}
                    onChange={(e) => setRevealDuration(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowBlind(false);
                    setMinBid("");
                    setCommitDuration("3600");
                    setRevealDuration("1800");
                  }}
                >
                  取消
                </button>
                <button
                  className="btn btn-secondary btn-sm flex-1"
                  disabled={!minBid || parseFloat(minBid) <= 0 || isCreatingBlind}
                  onClick={handleCreateBlindAuction}
                >
                  {isCreatingBlind ? (
                    <>
                      <span className="loading loading-spinner loading-xs mr-1"></span>
                      创建中...
                    </>
                  ) : (
                    "创建盲拍"
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};