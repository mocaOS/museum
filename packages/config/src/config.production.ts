export default {
  env: "production",

  website: {
    baseUrl: "https://v2.museumofcryptoart.com",
  },

  api: {
    baseUrl: "https://api.moca.qwellco.de",
  },

  r2r: {
    url: "https://r2r.moca.qwellco.de",
    apiKey: process.env.R2R_API_KEY || "",
  },
};
