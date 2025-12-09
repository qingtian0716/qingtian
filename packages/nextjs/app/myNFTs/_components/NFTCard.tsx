import { useState } from "react";
import { parseEther } from "viem";
import { Collectible } from "./MyHoldings";
import { Address, AddressInput } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export const NFTCard = ({ nft, selectable, selected, onSelectedChange }: { nft: Collectible; selectable?: boolean; selected?: boolean; onSelectedChange?: (checked: boolean) => void; }) => {
  const [transferToAddress, setTransferToAddress] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [isListing, setIsListing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });
  const { writeContractAsync: writeMarketplaceContract } = useScaffoldWriteContract({ contractName: "NFTMarketplace" });

  // 检查 NFT 是否有上架记录
  const nftContractAddress = process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS || "0x0";
  const { data: existingListingId } = useScaffoldReadContract({
    contractName: "NFTMarketplace",
    functionName: "getActiveListing",
    args: [nftContractAddress as `0x${string}`, BigInt(nft.id.toString())],
  });

  // 获取 listing 详情来检查是否真的是暂停状态
  const { data: listingDetails } = useScaffoldReadContract({
    contractName: "NFTMarketplace",
    functionName: "listings",
    args: [existingListingId ?? 0n],
    query: {
      enabled: existingListingId !== undefined && existingListingId > 0n,
    },
  });

  // 只有当 listingId 存在且 listing.active === false 时才是暂停状态
  // listingDetails 格式: [tokenId, nftContract, seller, price, active]
  const hasPausedListing = existingListingId !== undefined &&
    existingListingId > 0n &&
    listingDetails !== undefined &&
    (listingDetails as any)?.[4] === false;

  // 恢复上架处理函数
  const handleResumeListing = async () => {
    if (!existingListingId) return;
    try {
      setIsResuming(true);
      // 先确保授权
      await writeContractAsync({
        functionName: "approve",
        args: [process.env.NEXT_PUBLIC_NFT_MARKETPLACE_ADDRESS || "0x0", BigInt(nft.id.toString())],
      });
      // 恢复上架
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

  const handleSellNFT = async () => {
    if (!sellPrice || parseFloat(sellPrice) <= 0) {
      alert("请输入有效的价格");
      return;
    }

    try {
      setIsListing(true);

      // 首先需要授权市场合约操作这个 NFT
      await writeContractAsync({
        functionName: "approve",
        args: [process.env.NEXT_PUBLIC_NFT_MARKETPLACE_ADDRESS || "0x0", BigInt(nft.id.toString())],
      });

      // 然后在市场上列出 NFT
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
        {/* NFT Title and Description */}
        <div className="mb-4">
          <h3 className="card-title text-xl font-bold mb-2 line-clamp-1">{nft.name}</h3>
          <p className="text-sm opacity-70 line-clamp-2">{nft.description}</p>
        </div>

        {/* Attributes */}
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

        {/* Owner Info */}
        <div className="mb-4 p-3 bg-base-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold opacity-70">Owner</span>
            <Address address={nft.owner} size="sm" />
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="card-actions flex-col">
          {/* 如果有暂停的上架记录，显示恢复上架按钮 */}
          {hasPausedListing && !showTransfer && !showSell && (
            <div className="alert alert-warning mb-2">
              <span className="text-sm">此 NFT 有暂停的上架记录</span>
            </div>
          )}

          {!showTransfer && !showSell ? (
            <div className="flex gap-2 w-full">
              <button
                className="btn btn-outline btn-sm flex-1"
                onClick={() => setShowTransfer(true)}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer
              </button>
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
                <button
                  className="btn btn-primary btn-sm flex-1"
                  onClick={() => setShowSell(true)}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                  Sell
                </button>
              )}
            </div>
          ) : showTransfer ? (
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
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send
                </button>
              </div>
            </div>
          ) : showSell ? (
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
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                      </svg>
                      List for Sale
                    </>
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
