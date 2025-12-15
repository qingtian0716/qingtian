# �  NFT 交易平台

<h4 align="center">
  NFT 市场
</h4>

🎨 OP Sea 是一个功能完整的 NFT 交易平台，支持 NFT 铸造、上架交易、报价系统和盲拍竞拍。基于 Scaffold-ETH 2 开发，运行在 本地网络上。

⚙️ 技术栈：NextJS、RainbowKit、Hardhat、Wagmi、Viem、TypeScript、Pinata IPFS、MySQL。

## ✨ 核心功能

### 🖼️ NFT 铸造
- **单个铸造**：上传图片并铸造自定义 NFT
- **批量铸造**：一次性铸造多个 NFT
- **Excel 批量铸造**：通过 Excel 文件批量导入 NFT 数据
- **空投铸造**：向指定地址批量空投 NFT

### 🏪 NFT 市场
- **上架销售**：设置价格将 NFT 上架到市场
- **一键购买**：直接以上架价格购买 NFT
- **修改价格**：随时调整上架 NFT 的售价
- **暂停/恢复**：暂时下架或重新上架 NFT

### 💰 报价系统
- **发起报价**：对上架的 NFT 发起报价
- **接受报价**：卖家可选择接受心仪的报价
- **取消报价**：买家可随时取消自己的报价

### 🔒 盲拍功能
- **创建盲拍**：设置最低出价和时间参数
- **提交承诺**：在承诺期内提交加密出价
- **揭示出价**：在揭示期内公开真实出价金额
- **结算拍卖**：自动结算并退还未中标者的资金

## 🛠️ 环境要求

开始之前，请确保已安装以下工具：

- [Node.js (>= v20.18.3)](https://nodejs.org/en/download/)
- [Yarn (v1 或 v2+)](https://yarnpkg.com/getting-started/install)
- [Git](https://git-scm.com/downloads)
- [MySQL 数据库](https://www.mysql.com/downloads/)

## � 快速开始

### 1. 克隆项目并安装依赖

```bash
git clone https://github.com/qingtian0716/qingtian.git
cd 路径
yarn install
```

### 2. 配置环境变量

复制环境变量模板并填写配置：

**Hardhat 配置** (`packages/hardhat/.env`)：
```bash
ALCHEMY_API_KEY=your_alchemy_api_key
DEPLOYER_PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

**NextJS 配置** (`packages/nextjs/.env.local`)：
```bash
# Alchemy 和 WalletConnect
NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_api_key
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id

# Pinata IPFS 配置
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_API_KEY=your_pinata_secret_key
PINATA_GATEWAY=your_gateway.mypinata.cloud

# 合约地址（部署后填写）
NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS=0x...
NEXT_PUBLIC_NFT_MARKETPLACE_ADDRESS=0x...

# MySQL 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=nft
```

### 3. 启动本地开发环境

```bash
# 终端 1：初始化账号
 yarn generate
 yarn account
 打开metamask，向初始化账户转账eth

# 终端 2：部署合约
yarn deploy --network localgeth

把对应合约地址写入env.local文件

# 终端 3：启动前端
yarn start
```

📱 打开浏览器访问 [http://localhost:3000](http://localhost:3000)

## � 项目结构

```
nft_finish/
├── packages/
│   ├── hardhat/              # 智能合约
│   │   ├── contracts/
│   │   │   ├── YourCollectible.sol    # NFT 合约 (ERC721)
│   │   │   └── NFTMarketplace.sol     # 市场合约
│   │   └── deploy/           # 部署脚本
│   │
│   └── nextjs/               # 前端应用
│       ├── app/
│       │   ├── myNFTs/       # 我的 NFT 页面
│       │   ├── marketplace/  # NFT 市场
│       │   ├── blind-auctions/  # 盲拍广场
│       │   ├── ipfsUpload/   # IPFS 上传
│       │   └── ipfsDownload/ # IPFS 下载
│       ├── components/       # 公共组件
│       └── utils/            # 工具函数
```

## 🔗 智能合约

### YourCollectible.sol
基于 ERC721 的 NFT 合约，支持：
- NFT 铸造（`mintItem`）
- 元数据 URI 存储
- 所有权查询

### NFTMarketplace.sol
NFT 市场合约，支持：
- **上架管理**：上架、购买、取消、暂停、恢复
- **报价系统**：发起报价、取消报价、接受报价
- **盲拍功能**：创建盲拍、提交承诺、揭示出价、结算拍卖

## 🌐 部署到测试网

### 1. 生成部署账户

```bash
yarn generate
```

### 2. 查看账户余额

```bash
yarn account
```

### 3. 获取测试网 ETH

Optimism Sepolia 测试网水龙头：
- [Alchemy Faucet](https://www.alchemy.com/faucets/optimism-sepolia)
- [Optimism Faucet](https://app.optimism.io/faucet)

### 4. 部署合约

```bash
# 修改 hardhat.config.ts 中的 defaultNetwork
yarn deploy
```

### 5. 验证合约

```bash
yarn verify --network localgeth
```


## 📝 API 说明

### IPFS API
- `POST /api/ipfs/upload` - 上传文件到 IPFS
- `GET /api/ipfs/[hash]` - 获取 IPFS 文件

### 数据库 API
- `POST /api/db/save-image` - 保存 NFT 图片链接
- `GET /api/db/get-image` - 获取 NFT 图片链接

### 网络信息 API
- `GET /api/network-info` - 获取当前区块高度和 Gas 价格

## � 常用命令

```bash
# 启动本地区块链
yarn chain

# 部署合约
yarn deploy

# 启动前端开发服务器
yarn start

# 运行测试
yarn test

# 格式化代码
yarn format

# 检查类型
yarn lint
```

## 📄 许可证

本项目基于 MIT 许可证开源。

## 🙏 致谢

本项目基于 [Scaffold-ETH 2](https://scaffoldeth.io) 开发，感谢 Scaffold-ETH 团队提供的优秀开发框架。

---

<p align="center">
  Powered by Scaffold-ETH 2 • IPFS • Alchemy
</p>
