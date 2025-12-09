// Pinata API configuration
const PINATA_API_KEY = process.env.PINATA_API_KEY || "your_pinata_api_key_here";
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || "your_pinata_secret_key_here";
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";

// Pinata API client for uploading to IPFS
export const ipfsClient = {
  async add(content: string) {
    try {
      const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
        body: JSON.stringify({
          pinataContent: JSON.parse(content),
          pinataMetadata: {
            name: "NFT Metadata",
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return { path: result.IpfsHash };
    } catch (error) {
      console.error("Error uploading to Pinata:", error);
      throw error;
    }
  },
};

export async function getNFTMetadataFromIPFS(ipfsHash: string) {
  try {
    // Use Pinata gateway to fetch metadata
    const response = await fetch(`https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonObject = await response.json();
    return jsonObject;
  } catch (error) {
    console.log("Error fetching from IPFS:", error);
    return undefined;
  }
}
