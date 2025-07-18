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

interface R2RDeleteResponse {
  results: {
    message: string;
  };
}

class R2RApiKeyDeleter {
  private baseUrl: string;
  private email: string;
  private password: string;

  constructor(baseUrl: string, email: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash if present
    this.email = email;
    this.password = password;
  }

  async authenticate(): Promise<{ accessToken: string; refreshToken: string }> {
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

  async getUserId(accessToken: string): Promise<string> {
    try {
      const userResponse = await axios.get<R2RUserResponse>(`${this.baseUrl}/v3/users/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return userResponse.data.results.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Failed to get user ID:");
        console.error(`Status: ${error.response?.status}`);
        console.error(`Message: ${error.response?.data?.detail || error.message}`);
      } else {
        console.error("❌ Unexpected error while getting user ID:", error);
      }
      throw error;
    }
  }

  async listAllApiKeys(accessToken: string): Promise<R2RApiKeyListResponse["results"]> {
    try {
      console.log("\n🔍 Retrieving all API keys...");

      const userId = await this.getUserId(accessToken);

      // List all API keys
      const response = await axios.get<R2RApiKeyListResponse>(
        `${this.baseUrl}/v3/users/${userId}/api-keys`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const apiKeys = response.data.results;

      if (apiKeys.length > 0) {
        console.log(`📋 Found ${apiKeys.length} API key(s) to delete:`);
        apiKeys.forEach((key, index) => {
          console.log(`   ${index + 1}. ${key.name} (${key.key_id})`);
          console.log(`      Description: ${key.description}`);
          console.log(`      Updated: ${key.updated_at}`);
        });
      } else {
        console.log("✨ No API keys found for this user.");
      }

      return apiKeys;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Failed to list API keys:");
        console.error(`Status: ${error.response?.status}`);
        console.error(`Message: ${error.response?.data?.detail || error.message}`);
      } else {
        console.error("❌ Unexpected error while listing API keys:", error);
      }
      throw error;
    }
  }

  async deleteApiKey(accessToken: string, userId: string, keyId: string, keyName: string): Promise<void> {
    try {
      console.log(`🗑️  Deleting API key: ${keyName} (${keyId})`);

      const response = await axios.delete<R2RDeleteResponse>(
        `${this.baseUrl}/v3/users/${userId}/api-keys/${keyId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      console.log(`✅ Successfully deleted: ${keyName}`);

      if (response.data.results.message) {
        console.log(`   Message: ${response.data.results.message}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`❌ Failed to delete API key: ${keyName}`);
        console.error(`Status: ${error.response?.status}`);
        console.error(`Message: ${error.response?.data?.detail || error.message}`);

        if (error.response?.status === 404) {
          console.error("💡 This API key may have already been deleted or doesn't exist.");
        }
      } else {
        console.error(`❌ Unexpected error while deleting API key: ${keyName}`, error);
      }
      throw error;
    }
  }

  async deleteAllApiKeys(accessToken: string, apiKeys: R2RApiKeyListResponse["results"], confirmDelete: boolean = false): Promise<void> {
    if (apiKeys.length === 0) {
      console.log("✨ No API keys to delete.");
      return;
    }

    if (!confirmDelete) {
      console.log("\n⚠️  WARNING: This will delete ALL API keys for this user!");
      console.log("   This action cannot be undone.");
      console.log("   Set CONFIRM_DELETE=true in your .env file to proceed.");
      console.log("   Or modify the script to handle individual key deletion.");
      return;
    }

    console.log("\n🗑️  Starting deletion of all API keys...");

    const userId = await this.getUserId(accessToken);
    const deletionResults: Array<{ keyId: string; keyName: string; success: boolean; error?: string }> = [];

    for (const apiKey of apiKeys) {
      try {
        await this.deleteApiKey(accessToken, userId, apiKey.key_id, apiKey.name);
        deletionResults.push({
          keyId: apiKey.key_id,
          keyName: apiKey.name,
          success: true,
        });
      } catch (error) {
        deletionResults.push({
          keyId: apiKey.key_id,
          keyName: apiKey.name,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Summary
    console.log("\n📊 Deletion Summary:");
    console.log("===================");

    const successful = deletionResults.filter(r => r.success);
    const failed = deletionResults.filter(r => !r.success);

    console.log(`✅ Successfully deleted: ${successful.length} API key(s)`);
    if (successful.length > 0) {
      successful.forEach((result) => {
        console.log(`   - ${result.keyName} (${result.keyId})`);
      });
    }

    if (failed.length > 0) {
      console.log(`❌ Failed to delete: ${failed.length} API key(s)`);
      failed.forEach((result) => {
        console.log(`   - ${result.keyName} (${result.keyId}): ${result.error}`);
      });
    }

    // Save deletion log
    this.saveDeletionLog(deletionResults);
  }

  saveDeletionLog(deletionResults: Array<{ keyId: string; keyName: string; success: boolean; error?: string }>): void {
    const logData = {
      deletion_timestamp: new Date().toISOString(),
      base_url: this.baseUrl,
      user_email: this.email,
      results: deletionResults,
      summary: {
        total_processed: deletionResults.length,
        successful_deletions: deletionResults.filter(r => r.success).length,
        failed_deletions: deletionResults.filter(r => !r.success).length,
      },
    };

    const logFilePath = join(process.cwd(), "r2r-deletion-log.json");
    writeFileSync(logFilePath, JSON.stringify(logData, null, 2));

    console.log(`📄 Deletion log saved to: ${logFilePath}`);
  }
}

async function main() {
  // Configuration from environment variables
  const R2R_BASE_URL = process.env.R2R_BASE_URL;
  const R2R_EMAIL = process.env.R2R_EMAIL;
  const R2R_PASSWORD = process.env.R2R_PASSWORD;
  const CONFIRM_DELETE = process.env.CONFIRM_DELETE === "true"; // Must be explicitly set to true

  console.log("🗑️  R2R API Key Deleter");
  console.log("========================\n");

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

  const apiKeyDeleter = new R2RApiKeyDeleter(R2R_BASE_URL, R2R_EMAIL, R2R_PASSWORD);

  try {
    // Step 1: Authenticate
    const { accessToken } = await apiKeyDeleter.authenticate();

    // Step 2: List all API keys
    const apiKeys = await apiKeyDeleter.listAllApiKeys(accessToken);

    // Step 3: Delete all API keys (with confirmation)
    await apiKeyDeleter.deleteAllApiKeys(accessToken, apiKeys, CONFIRM_DELETE);

    console.log("\n🎉 API key deletion process completed!");

    if (!CONFIRM_DELETE && apiKeys.length > 0) {
      console.log("💡 To actually delete the keys, set CONFIRM_DELETE=true in your .env file and run again.");
    }
  } catch (error) {
    console.error("\n💥 Failed to complete API key deletion");
    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main();
}
