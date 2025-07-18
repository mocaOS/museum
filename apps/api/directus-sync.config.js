const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  debug: true,
  directusUrl: process.env.PUBLIC_URL || "http://localhost:8055",
  directusToken: process.env.NODE_ENV === "production"
    ? process.env.DIRECTUS_API_KEY
    : process.env.NODE_ENV === "staging"
      ? process.env.DIRECTUS_API_KEY_STAGING
      : process.env.DIRECTUS_API_KEY_DEV,
};
