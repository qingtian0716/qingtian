// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTMarketplace is ReentrancyGuard, Ownable {
    struct Listing {
        uint256 tokenId;
        address nftContract;
        address seller;
        uint256 price;
        bool active;
    }

    struct ListingWithId {
        uint256 listingId;
        uint256 tokenId;
        address nftContract;
        address seller;
        uint256 price;
        bool active;
    }

    // Mapping from listing ID to Listing
    mapping(uint256 => Listing) public listings;
    
    // Mapping from NFT contract and token ID to listing ID
    mapping(address => mapping(uint256 => uint256)) public tokenToListing;
    
    uint256 public nextListingId = 1;
    uint256 public marketplaceFee = 250; // 2.5% fee (250 basis points)

    struct Offer {
        address offerer;
        uint256 amount;
        uint256 expiration;
        bool active;
    }

    // Offers per listing (escrow ETH in contract)
    mapping(uint256 => Offer[]) public listingOffers;

    event OfferMade(uint256 indexed listingId, address indexed offerer, uint256 amount, uint256 expiration);
    event OfferCancelled(uint256 indexed listingId, address indexed offerer, uint256 amount);
    event OfferAccepted(
        uint256 indexed listingId,
        address indexed offerer,
        uint256 amount
    );
    event NFTListed(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 price
    );
    
    event NFTSold(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        address buyer,
        uint256 price
    );
    
    event ListingCancelled(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller
    );
    // Listing management events
    event ListingPaused(uint256 indexed listingId);
    event ListingResumed(uint256 indexed listingId);

    constructor() Ownable(msg.sender) {}

    function listNFT(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external nonReentrant {
        require(price > 0, "Price must be greater than 0");
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "You don't own this NFT"
        );
        require(
            IERC721(nftContract).isApprovedForAll(msg.sender, address(this)) ||
            IERC721(nftContract).getApproved(tokenId) == address(this),
            "Marketplace not approved to transfer NFT"
        );
        require(
            tokenToListing[nftContract][tokenId] == 0,
            "NFT already listed"
        );

        uint256 listingId = nextListingId++;
        
        listings[listingId] = Listing({
            tokenId: tokenId,
            nftContract: nftContract,
            seller: msg.sender,
            price: price,
            active: true
        });
        
        tokenToListing[nftContract][tokenId] = listingId;

        emit NFTListed(listingId, nftContract, tokenId, msg.sender, price);
    }

    function buyNFT(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(msg.value >= listing.price, "Insufficient payment");
        require(msg.sender != listing.seller, "Cannot buy your own NFT");

        // Check if seller still owns the NFT
        require(
            IERC721(listing.nftContract).ownerOf(listing.tokenId) == listing.seller,
            "Seller no longer owns this NFT"
        );

        listing.active = false;
        tokenToListing[listing.nftContract][listing.tokenId] = 0;

        // Calculate marketplace fee
        uint256 fee = (listing.price * marketplaceFee) / 10000;
        uint256 sellerAmount = listing.price - fee;

        // Transfer NFT to buyer
        IERC721(listing.nftContract).safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId
        );

        // Transfer payment to seller
        (bool success, ) = payable(listing.seller).call{value: sellerAmount}("");
        require(success, "Payment to seller failed");

        // Refund excess payment
        if (msg.value > listing.price) {
            (bool refundSuccess, ) = payable(msg.sender).call{
                value: msg.value - listing.price
            }("");
            require(refundSuccess, "Refund failed");
        }

        emit NFTSold(
            listingId,
            listing.nftContract,
            listing.tokenId,
            listing.seller,
            msg.sender,
            listing.price
        );
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(
            listing.seller == msg.sender || owner() == msg.sender,
            "Only seller or owner can cancel"
        );

        listing.active = false;
        tokenToListing[listing.nftContract][listing.tokenId] = 0;

        emit ListingCancelled(
            listingId,
            listing.nftContract,
            listing.tokenId,
            listing.seller
        );
    }
    // Pause a listing without removing the mapping, allowing resume later
    function pauseListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Only seller can pause");
        listing.active = false;
        // keep tokenToListing mapping for resume
        emit ListingPaused(listingId);
    }

    // Resume a previously paused listing
    function resumeListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(!listing.active, "Listing already active");
        require(listing.seller == msg.sender, "Only seller can resume");
        // ensure seller still owns and marketplace has approval
        IERC721 nft = IERC721(listing.nftContract);
        require(nft.ownerOf(listing.tokenId) == listing.seller, "Seller no longer owns");
        require(
            nft.isApprovedForAll(listing.seller, address(this)) ||
            nft.getApproved(listing.tokenId) == address(this),
            "Marketplace not approved"
        );
        listing.active = true;
        // restore mapping if cleared
        if (tokenToListing[listing.nftContract][listing.tokenId] == 0) {
            tokenToListing[listing.nftContract][listing.tokenId] = listingId;
        }
        emit ListingResumed(listingId);
    }

    function updatePrice(uint256 listingId, uint256 newPrice) external {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Only seller can update price");
        require(newPrice > 0, "Price must be greater than 0");

        listing.price = newPrice;
    }

    function getActiveListing(address nftContract, uint256 tokenId)
        external
        view
        returns (uint256)
    {
        return tokenToListing[nftContract][tokenId];
    }

    function getAllActiveListings() external view returns (ListingWithId[] memory) {
        uint256 activeCount = 0;
        
        // Count active listings
        for (uint256 i = 1; i < nextListingId; i++) {
            if (listings[i].active) {
                activeCount++;
            }
        }
        
        // Create array of active listings with IDs
        ListingWithId[] memory activeListings = new ListingWithId[](activeCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 1; i < nextListingId; i++) {
            if (listings[i].active) {
                activeListings[currentIndex] = ListingWithId({
                    listingId: i,
                    tokenId: listings[i].tokenId,
                    nftContract: listings[i].nftContract,
                    seller: listings[i].seller,
                    price: listings[i].price,
                    active: listings[i].active
                });
                currentIndex++;
            }
        }
        
        return activeListings;
    }

    function makeOffer(uint256 listingId, uint256 expiration) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(msg.sender != listing.seller, "Seller cannot offer");
        require(msg.value > 0, "Offer must be > 0");
        require(expiration > block.timestamp, "Expiration must be in future");

        listingOffers[listingId].push(Offer({
            offerer: msg.sender,
            amount: msg.value,
            expiration: expiration,
            active: true
        }));

        emit OfferMade(listingId, msg.sender, msg.value, expiration);
    }

    function cancelOffer(uint256 listingId, uint256 offerIndex) external nonReentrant {
        require(offerIndex < listingOffers[listingId].length, "Invalid offer index");
        Offer storage offer = listingOffers[listingId][offerIndex];
        require(offer.active, "Offer not active");
        require(offer.offerer == msg.sender, "Not offerer");

        offer.active = false;
        (bool refunded, ) = payable(msg.sender).call{value: offer.amount}("");
        require(refunded, "Refund failed");

        emit OfferCancelled(listingId, msg.sender, offer.amount);
    }

    function acceptOffer(uint256 listingId, uint256 offerIndex) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Only seller");
        require(offerIndex < listingOffers[listingId].length, "Invalid offer index");
        Offer storage offer = listingOffers[listingId][offerIndex];
        require(offer.active, "Offer not active");
        require(offer.expiration >= block.timestamp, "Offer expired");

        // Ensure seller still owns and approved
        IERC721 nft = IERC721(listing.nftContract);
        require(nft.ownerOf(listing.tokenId) == listing.seller, "Seller no longer owns");
        require(
            nft.isApprovedForAll(listing.seller, address(this)) ||
            nft.getApproved(listing.tokenId) == address(this),
            "Marketplace not approved"
        );

        // finalize sale
        listing.active = false;
        tokenToListing[listing.nftContract][listing.tokenId] = 0;
        offer.active = false;

        uint256 fee = (offer.amount * marketplaceFee) / 10000;
        uint256 sellerAmount = offer.amount - fee;

        // transfer NFT
        nft.safeTransferFrom(listing.seller, offer.offerer, listing.tokenId);
        // pay seller
        (bool paid, ) = payable(listing.seller).call{value: sellerAmount}("");
        require(paid, "Payment to seller failed");

        emit OfferAccepted(listingId, offer.offerer, offer.amount);
        emit NFTSold(listingId, listing.nftContract, listing.tokenId, listing.seller, offer.offerer, offer.amount);
    }

    function getOffers(uint256 listingId) external view returns (Offer[] memory) {
        return listingOffers[listingId];
    }
    function setMarketplaceFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Fee cannot exceed 10%"); // Max 10%
        marketplaceFee = newFee;
    }

    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    // Emergency function to recover stuck NFTs (only owner)
    function emergencyRecoverNFT(
        address nftContract,
        uint256 tokenId,
        address to
    ) external onlyOwner {
        IERC721(nftContract).safeTransferFrom(address(this), to, tokenId);
    }
}