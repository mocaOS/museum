import { writeFileSync } from "node:fs";
import { join } from "node:path";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface R2RLoginResponse {
  results: {
    access_token: {
      token: string;
      token_type: string;
    };
    refresh_token: {
      token: string;
      token_type: string;
    };
  };
}

interface R2RUserResponse {
  results: {
    id: string;
    email: string;
    is_superuser: boolean;
    [key: string]: any;
  };
}

interface R2RApiKeyRequest {
  name: string;
  description: string;
}

interface R2RApiKeyResponse {
  results: {
    public_key: string;
    api_key: string;
    key_id: string;
    name: string;
  };
}

interface R2RApiKeyListResponse {
  results: Array<{
    public_key: string;
    key_id: string;
    updated_at: string;
    name: string;
    description: string;
  }>;
  total_entries: number;
}

class R2RApiKeyManager {
  private baseUrl: string;
  private email: string;
  private password: string;

  constructor(baseUrl: string, email: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash if present
    this.email = email;
    this.password = password;
  }

  async createApiKey(): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      console.log("🔐 Authenticating with R2R...");
      console.log(`📡 Base URL: ${this.baseUrl}`);
      console.log(`👤 Email: ${this.email}`);

      // Use form data (application/x-www-form-urlencoded) as required by R2R API
      const formData = new URLSearchParams();
      formData.append("username", this.email);
      formData.append("password", this.password);

      const response = await axios.post<R2RLoginResponse>(
        `${this.baseUrl}/v3/users/login`,
        formData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const { access_token, refresh_token } = response.data.results;

      console.log("✅ Authentication successful!");
      console.log(`🔑 Access Token Type: ${access_token.token_type}`);
      console.log(`🔄 Refresh Token Type: ${refresh_token.token_type}`);

      return {
        accessToken: access_token.token,
        refreshToken: refresh_token.token,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Authentication failed:");
        console.error(`Status: ${error.response?.status}`);
        console.error(`Message: ${error.response?.data?.detail || error.message}`);

        if (error.response?.status === 422) {
          console.error("💡 This usually means invalid credentials or the user account is not active.");
        }
      } else {
        console.error("❌ Unexpected error:", error);
      }
      throw error;
    }
  }

  async listExistingApiKeys(accessToken: string): Promise<R2RApiKeyListResponse["results"]> {
    try {
      console.log("\n🔍 Checking for existing API keys...");

      // First, get the current user's ID
      const userResponse = await axios.get<R2RUserResponse>(`${this.baseUrl}/v3/users/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const userId = userResponse.data.results.id;

      // List existing API keys
      const response = await axios.get<R2RApiKeyListResponse>(
        `${this.baseUrl}/v3/users/${userId}/api-keys`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const existingKeys = response.data.results;

      if (existingKeys.length > 0) {
        console.log(`📋 Found ${existingKeys.length} existing API key(s):`);
        existingKeys.forEach((key, index) => {
          console.log(`   ${index + 1}. ${key.name} (${key.key_id})`);
          console.log(`      Description: ${key.description}`);
          console.log(`      Updated: ${key.updated_at}`);
        });
      } else {
        console.log("✨ No existing API keys found.");
      }

      return existingKeys;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Failed to list existing API keys:");
        console.error(`Status: ${error.response?.status}`);
        console.error(`Message: ${error.response?.data?.detail || error.message}`);
      } else {
        console.error("❌ Unexpected error while listing API keys:", error);
      }
      throw error;
    }
  }

  async createActualApiKey(accessToken: string, apiKeyName: string = "MOCA R2R API Key", apiKeyDescription: string = "API key for MOCA R2R integration"): Promise<{ apiKey: string; keyId: string; publicKey: string }> {
    try {
      console.log("\n🔑 Creating API key...");

      // First, get the current user's ID
      const userResponse = await axios.get<R2RUserResponse>(`${this.baseUrl}/v3/users/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const userId = userResponse.data.results.id;
      console.log(`👤 User ID: ${userId}`);

      // Create the API key
      const apiKeyRequest: R2RApiKeyRequest = {
        name: apiKeyName,
        description: apiKeyDescription,
      };

      const response = await axios.post<R2RApiKeyResponse>(
        `${this.baseUrl}/v3/users/${userId}/api-keys`,
        apiKeyRequest,
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const { api_key, key_id, public_key, name } = response.data.results;

      console.log("✅ API key created successfully!");
      console.log(`🏷️  Name: ${name}`);
      console.log(`🔑 Key ID: ${key_id}`);
      console.log(`🔐 Public Key: ${public_key}`);

      return {
        apiKey: api_key,
        keyId: key_id,
        publicKey: public_key,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ API key creation failed:");
        console.error(`Status: ${error.response?.status}`);
        console.error(`Message: ${error.response?.data?.detail || error.message}`);
      } else {
        console.error("❌ Unexpected error during API key creation:", error);
      }
      throw error;
    }
  }

  async testApiKey(apiKey: string): Promise<void> {
    try {
      console.log("\n🧪 Testing API key...");

      const response = await axios.get(`${this.baseUrl}/v3/users/me`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      console.log("✅ API key is valid!");
      console.log(`👤 Authenticated as: ${response.data.results.email}`);
      console.log(`🔒 Is superuser: ${response.data.results.is_superuser}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ API key test failed:");
        console.error(`Status: ${error.response?.status}`);
        console.error(`Message: ${error.response?.data?.detail || error.message}`);
      } else {
        console.error("❌ Unexpected error during API key test:", error);
      }
      throw error;
    }
  }

  promptUserChoice(existingKeys: R2RApiKeyListResponse["results"], forceCreate: boolean = false): boolean {
    if (forceCreate) {
      console.log("\n🔧 Force create mode enabled - creating a new API key.");
      return true;
    }

    console.log("\n⚠️  API keys already exist!");
    console.log("💡 To create an additional API key, set FORCE_CREATE_NEW=true in your environment variables.");
    console.log("   Example: FORCE_CREATE_NEW=true bun run create-r2r-api-key.ts");
    console.log("📋 You can use one of the existing API keys listed above.");
    return false; // Don't create new unless forced
  }

  generateUniqueKeyName(existingKeys: R2RApiKeyListResponse["results"], baseName: string = "MOCA R2R API Key"): string {
    const existingNames = existingKeys.map(key => key.name);

    if (!existingNames.includes(baseName)) {
      return baseName;
    }

    let counter = 2;
    let newName = `${baseName} (${counter})`;

    while (existingNames.includes(newName)) {
      counter++;
      newName = `${baseName} (${counter})`;
    }

    console.log(`💡 Generated unique name: "${newName}" to avoid conflicts.`);
    return newName;
  }

  saveTokensToFile(accessToken: string, refreshToken: string, apiKeyData: { apiKey: string; keyId: string; publicKey: string }): void {
    const tokenData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      api_key: apiKeyData.apiKey,
      key_id: apiKeyData.keyId,
      public_key: apiKeyData.publicKey,
      created_at: new Date().toISOString(),
      base_url: this.baseUrl,
    };

    const tokenFilePath = join(process.cwd(), "r2r-tokens.json");
    writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2));

    console.log(`💾 All tokens saved to: ${tokenFilePath}`);
    console.log("\n📋 Your R2R API Key:");
    console.log(`${apiKeyData.apiKey}`);
    console.log("\n🔧 Usage example:");
    console.log(`curl -X GET "${this.baseUrl}/v3/users/me" \\`);
    console.log(`     -H "Authorization: Bearer ${apiKeyData.apiKey}"`);
  }
}

async function main() {
  // Configuration from environment variables
  const R2R_BASE_URL = process.env.R2R_BASE_URL;
  const R2R_EMAIL = process.env.R2R_EMAIL;
  const R2R_PASSWORD = process.env.R2R_PASSWORD;
  const FORCE_CREATE_NEW = process.env.FORCE_CREATE_NEW === "true"; // Set to true to always create new keys without prompts
  const API_KEY_NAME = process.env.API_KEY_NAME || "MOCA R2R API Key";
  const API_KEY_DESCRIPTION = process.env.API_KEY_DESCRIPTION || "API key for MOCA R2R integration";

  console.log("🚀 R2R API Key Creator");
  console.log("=======================\n");

  // Validate required environment variables
  if (!R2R_BASE_URL || !R2R_EMAIL || !R2R_PASSWORD) {
    console.error("❌ Missing required environment variables:");
    if (!R2R_BASE_URL) console.error("   - R2R_BASE_URL");
    if (!R2R_EMAIL) console.error("   - R2R_EMAIL");
    if (!R2R_PASSWORD) console.error("   - R2R_PASSWORD");
    console.error("\n💡 Please create a .env file with the required variables.");
    console.error("   See the README.md for configuration details.");
    process.exit(1);
  }

  const apiKeyManager = new R2RApiKeyManager(R2R_BASE_URL, R2R_EMAIL, R2R_PASSWORD);

  try {
    // Step 1: Get access token by logging in
    const { accessToken, refreshToken } = await apiKeyManager.createApiKey();

    // Step 2: Check for existing API keys
    const existingKeys = await apiKeyManager.listExistingApiKeys(accessToken);

    let apiKeyData: { apiKey: string; keyId: string; publicKey: string };

    if (existingKeys.length > 0) {
      // User has existing keys, prompt for action
      const shouldCreateNew = apiKeyManager.promptUserChoice(existingKeys, FORCE_CREATE_NEW);

      if (shouldCreateNew) {
        console.log("\n🆕 Creating a new API key...");
        // Generate a unique name to avoid conflicts
        const uniqueName = apiKeyManager.generateUniqueKeyName(existingKeys, API_KEY_NAME);
        // Step 3a: Create the actual API key using the access token
        apiKeyData = await apiKeyManager.createActualApiKey(accessToken, uniqueName, API_KEY_DESCRIPTION);
      } else {
        console.log("\n📋 Using existing API key. You'll need to retrieve it manually.");
        console.log("💡 You can use the R2R API to get the full key details if needed.");
        process.exit(0);
      }
    } else {
      // No existing keys, proceed with creation
      console.log("\n🆕 Creating your first API key...");
      // Step 3b: Create the actual API key using the access token
      apiKeyData = await apiKeyManager.createActualApiKey(accessToken, API_KEY_NAME, API_KEY_DESCRIPTION);
    }

    // Step 4: Test the API key
    await apiKeyManager.testApiKey(apiKeyData.apiKey);

    // Step 5: Save all tokens to file
    apiKeyManager.saveTokensToFile(accessToken, refreshToken, apiKeyData);

    console.log("\n🎉 Success! Your R2R API key has been created and tested.");
    console.log("📝 All tokens have been saved to r2r-tokens.json");
    console.log("⚠️  Keep your API key secure and do not share it publicly!");
  } catch (error) {
    console.error("\n💥 Failed to create or test API key");
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main();
}
