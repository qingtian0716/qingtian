"use client";

import { AirdropMinter, MyHoldings, CustomNFTMinter, BatchNFTMinter, ExcelBatchMinter, MyListings } from "./_components";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { addToIPFS } from "~~/utils/simpleNFT/ipfs-fetch";
import nftsMetadata from "~~/utils/simpleNFT/nftsMetadata";

const MyNFTs: NextPage = () => {
  const { address: connectedAddress, isConnected, isConnecting } = useAccount();

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible" });

  const { data: tokenIdCounter } = useScaffoldReadContract({
    contractName: "YourCollectible",
    functionName: "tokenIdCounter",
    watch: true,
  });

  const handleMintItem = async () => {
    // circle back to the zero item if we've reached the end of the array
    if (tokenIdCounter === undefined) return;

    const tokenIdCounterNumber = Number(tokenIdCounter);
    const currentTokenMetaData = nftsMetadata[tokenIdCounterNumber % nftsMetadata.length];
    const notificationId = notification.loading("Uploading to IPFS");
    try {
      const uploadedItem = await addToIPFS(currentTokenMetaData);

      // First remove previous loading notification and then show success notification
      notification.remove(notificationId);
      notification.success("Metadata uploaded to IPFS");

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
        console.error("Save preset image to DB failed", e);
      }
    } catch (error) {
      notification.remove(notificationId);
      console.error(error);
    }
  };

  return (
    <>
      <div className="flex items-center flex-col pt-10">
        <div className="px-5">
          <h1 className="text-center mb-8">
            <span className="block text-4xl font-bold">My NFTs</span>
          </h1>
        </div>
      </div>

      {!isConnected || isConnecting ? (
        <div className="flex justify-center">
          <RainbowKitCustomConnectButton />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 justify-center items-start px-5 mb-8">
          {/* Original Mint NFT */}
          <div className="card bg-base-100 shadow-xl w-full max-w-md mx-auto">
            <div className="card-body">
              <h2 className="card-title text-center">Mint Preset NFT</h2>
              <p className="text-center text-sm opacity-70 mb-4">
                Mint from predefined collection
              </p>
              <button className="btn btn-secondary" onClick={handleMintItem}>
                Mint NFT
              </button>
            </div>
          </div>

          {/* Custom NFT Minter */}
          <CustomNFTMinter />

          {/* Batch NFT Minter */}
          <BatchNFTMinter />

          {/* Excel Batch Minter */}
          <ExcelBatchMinter />

          {/* Airdrop NFTs */}
          <AirdropMinter />


        </div>
      )}

      <MyHoldings />
      <MyListings />

    </>
  );
};

export default MyNFTs;
