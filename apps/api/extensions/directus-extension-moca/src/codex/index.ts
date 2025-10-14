import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Router } from "express";
import { defineEndpoint } from "@directus/extensions-sdk";

export default defineEndpoint({
  id: "codex",

  handler: (router: Router) => {
    // GET /codex/:token_id
    router.get("/:token_id", async (req, res) => {
      try {
        const tokenId = req.params.token_id;

        // Validate token_id is a number
        const tokenIdNum = Number.parseInt(tokenId, 10);
        if (Number.isNaN(tokenIdNum)) {
          return res.status(400).json({
            success: false,
            error: "Invalid token ID. Must be a number.",
          });
        }

        // Format token ID with zero padding (5 digits)
        const paddedTokenId = String(tokenIdNum).padStart(5, "0");
        const filename = `Art_DeCC0_${paddedTokenId}.codex.json`;

        // Construct the path to the codex file
        // The codex folder is in apps/api/codex/ (will be a docker volume)
        // Use environment variable if set, otherwise use default path
        const codexDir
          = process.env.CODEX_DIR || path.resolve(process.cwd(), "codex");
        const codexPath = path.join(codexDir, filename);

        // Check if file exists
        if (!existsSync(codexPath)) {
          return res.status(404).json({
            success: false,
            error: `Codex file not found for token ID: ${tokenId}`,
            filename,
          });
        }

        // Read and parse the JSON file
        const fileContent = readFileSync(codexPath, "utf8");
        const codexData = JSON.parse(fileContent);

        // Return the codex data
        return res.json({
          success: true,
          token_id: tokenIdNum,
          data: codexData,
        });
      } catch (error: any) {
        console.error("Error reading codex file:", error);
        return res.status(500).json({
          success: false,
          error: "Internal server error while reading codex file",
          message: error?.message || "Unknown error",
        });
      }
    });
  },
});
