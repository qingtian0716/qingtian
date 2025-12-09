import { getNFTMetadataFromIPFS } from "~~/utils/simpleNFT/ipfs";

export async function POST(request: Request) {
  try {
    const { ipfsHash } = await request.json();
    const res = await getNFTMetadataFromIPFS(ipfsHash);

    // 检查是否成功获取到数据
    if (res === undefined) {
      return Response.json({ error: "Failed to fetch metadata from IPFS" }, { status: 502 });
    }

    return Response.json(res);
  } catch (error) {
    console.log("Error getting metadata from ipfs", error);
    return Response.json({ error: "Error getting metadata from ipfs" }, { status: 500 });
  }
}
