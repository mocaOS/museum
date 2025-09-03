export default {
  env: "development",

  website: {
    baseUrl: "http://localhost:3000",
    // externalUrl: "https://kojii.lt.boltapi.com",
  },

  api: {
    baseUrl: "http://localhost:8055",
    // externalUrl: "https://api-kojii.lt.boltapi.com",
  },

  media: {
    baseUrl: "https://media.qwellcode.de/api",
  },

  // R2R configuration
  r2r: {
    url: "https://r2r-staging.deploy.qwellco.de",
    apiKey: "key_sQ3m4HCbc7JjGcMAVCxJJw==.Qmdgw-vn_ecLJPWUzbnxnJw_aD0gr_OkC7GBygarH0I=",
    // apiKey: "key_1z-STFdVa7z9FHuYTd5kUA==.6gmgNGrhYP2TLl7PYTDtUw6NWYhQ_A3TlWd7UELNwhA=",
  },

  networks: {
    project_id: "f2664fb3885da58f5051e48fe98029c4",
    default_network: {
      chainId: 11155111,
      name: "Sepolia",
      currency: "ETH",
      explorerUrl: "https://sepolia.etherscan.io",
      rpcUrl: "https://ethereum-sepolia.core.chainstack.com/0df898c4e52037730387a02615a0f728",
    },
  },
};
