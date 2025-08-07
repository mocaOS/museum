import { defineHook } from "@directus/extensions-sdk";
import { r2rClient } from "r2r-js";

export default defineHook(({ schedule }, { env, logger }) => {
  // Schedule a task to pull latest entities to the graph every minute
  schedule("0 * * * * *", async () => {
    try {
      await pullLatestEntitiesToGraph(env as any, logger as any);
    } catch (error) {
      logger.error("Error in scheduled R2R graph pull task:", error);
      console.log(error);
    }
  });

  async function pullLatestEntitiesToGraph(env: any, logger: any) {
    try {
      // Initialize R2R client
      const r2rEndpoint = env.R2R_ENDPOINT || "http://localhost:7272";
      const r2rApiKey = env.R2R_API_KEY;

      if (!r2rApiKey) {
        logger.error("R2R API key not found in environment variables");
        return;
      }

      // eslint-disable-next-line new-cap
      const client = new r2rClient(r2rEndpoint);

      // Get all collections and find the one with the largest document count
      logger.debug("Fetching collections to find the one with the largest document count");
      const collectionsResponse = await client.collections.list();

      if (!collectionsResponse.results || collectionsResponse.results.length === 0) {
        logger.warn("No collections found in R2R, skipping graph pull");
        return;
      }

      // Find collection with largest document_count
      const largestCollection = collectionsResponse.results.reduce((prev: any, current: any) => {
        const prevCount = (prev as any).document_count || (prev as any).documentCount || 0;
        const currentCount = (current as any).document_count || (current as any).documentCount || 0;
        return prevCount > currentCount ? prev : current;
      });

      const targetCollectionId = (largestCollection as any).id;
      const documentCount = (largestCollection as any).document_count || (largestCollection as any).documentCount || 0;

      logger.info(`Selected collection with largest document count: ${(largestCollection as any).name} (ID: ${targetCollectionId}, document_count: ${documentCount})`);

      if (documentCount === 0) {
        logger.info("Selected collection has no documents, skipping graph pull");
        return;
      }

      // Pull latest entities to the graph for the selected collection
      logger.info(`Pulling latest entities to graph for collection: ${targetCollectionId}`);

      const pullResult = await client.graphs.pull({
        collectionId: targetCollectionId,
      });

      logger.info(`Successfully pulled latest entities to graph for collection ${targetCollectionId}: ${JSON.stringify(pullResult)}`);

      // Log the results
      if (pullResult.results && pullResult.results.success) {
        logger.info(`Graph pull completed successfully for collection ${targetCollectionId}`);
      } else {
        logger.debug(`Graph pull may have failed for collection ${targetCollectionId}. Response: ${JSON.stringify(pullResult)}`);
      }
    } catch (error) {
      logger.error("Error pulling latest entities to R2R graph:", error);
      console.log(error);

      throw error;
    }
  }
});
