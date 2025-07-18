import { unlinkSync, writeFileSync } from "node:fs";
import { defineHook } from "@directus/extensions-sdk";
import { r2rClient } from "r2r-js";
import config from "@local/config";

export default defineHook(({ schedule, action, filter }, { env, logger, services, getSchema }) => {
  logger.debug("R2R Document Sync hook is being initialized");

  // CONCURRENCY CONTROL: This hook implements several mechanisms to prevent
  // the infinite loop issues that were occurring:
  // 1. Global sync lock to prevent multiple sync tasks from running simultaneously
  // 2. Per-file processing tracking to prevent concurrent processing of the same file
  // 3. Improved error handling for 409 conflicts when documents are being processed
  // 4. Better temporary file cleanup with try-finally blocks
  // 5. Automatic cleanup of stale processing states

  // Store file info before deletion so we can access it after deletion
  const filesToDeleteFromR2R = new Map<string, { r2r_id: string; filename: string }>();

  // Global lock to prevent concurrent sync tasks
  let syncInProgress = false;

  // Map to track files currently being processed with timestamps
  const processingFiles = new Map<string, number>();

  // Schedule a task to check for unsynced R2R files every minute
  schedule("0 * * * * *", async () => {
    // Skip if sync is already in progress
    if (syncInProgress) {
      logger.debug("R2R sync task already in progress, skipping this run");
      return;
    }

    try {
      syncInProgress = true;

      // Clean up stale processing states (older than 10 minutes)
      const tenMinutesAgo = Date.now() - 600000;
      const staleFiles = Array.from(processingFiles.entries()).filter(([ _, timestamp ]) => timestamp < tenMinutesAgo);
      for (const [ fileId ] of staleFiles) {
        processingFiles.delete(fileId);
        logger.debug(`Cleaned up stale processing state for file: ${fileId}`);
      }

      await checkAndHandleRetryFiles(env as any, logger as any, services as any, getSchema);
      await checkAndSyncR2RFiles(env as any, logger as any, services as any, getSchema);
      await checkAndUpdateR2RStatusFields(env as any, logger as any, services as any, getSchema);
    } catch (error) {
      logger.error("Error in scheduled R2R sync task:", error);
    } finally {
      syncInProgress = false;
    }
  });

  action("files.delete", async (meta, context) => {
    await handleFileDeletion(meta, "files.delete");
  });

  // Use filter hook to capture file info BEFORE deletion
  filter("files.delete", async (payload, meta, context) => {
    try {
      // Get file IDs that are about to be deleted
      const fileIds = Array.isArray(payload) ? payload : [ payload ];

      await captureFileInfoBeforeDeletion(fileIds);
    } catch (error) {
      logger.error("Error capturing file info before deletion:", error);
    }

    return payload;
  });

  async function captureFileInfoBeforeDeletion(fileIds: string[]) {
    try {
      const { FilesService, FoldersService } = services;
      const schema = await getSchema();

      const filesService = new FilesService({
        schema,
        accountability: { admin: true },
      });

      const foldersService = new FoldersService({
        schema,
        accountability: { admin: true },
      });

      // Find the R2R folder
      const r2rFolders = await foldersService.readByQuery({
        filter: {
          name: { _eq: "R2R" },
          parent: { _null: true },
        },
        limit: 1,
      });

      if (r2rFolders.length === 0) {
        logger.debug("R2R folder not found, skipping R2R deletion check");
        return;
      }

      const r2rFolderId = r2rFolders[0].id;

      // Check each file before it gets deleted
      for (const fileId of fileIds) {
        try {
          const file = await filesService.readOne(fileId);

          // If file is in R2R folder and has r2r_id, store it for later deletion
          if (file.folder === r2rFolderId && file.r2r_id) {
            logger.info(`Capturing R2R file for deletion: ${file.filename_download} (R2R ID: ${file.r2r_id})`);
            filesToDeleteFromR2R.set(fileId, {
              r2r_id: file.r2r_id,
              filename: file.filename_download,
            });
          }
        } catch (error) {
          logger.error(`Failed to read file ${fileId} before deletion:`, error);
        }
      }
    } catch (error) {
      logger.error("Error in captureFileInfoBeforeDeletion:", error);
    }
  }

  async function handleFileDeletion(meta: any, eventName: string) {
    try {
      logger.info(`Processing file deletion via ${eventName}`, meta);
      const { keys } = meta;

      if (!keys || keys.length === 0) {
        logger.debug("No files to process for deletion");
        return;
      }

      // Convert keys to array if it's a single key
      const fileIds = Array.isArray(keys) ? keys : [ keys ];

      // Use the stored file information to delete from R2R
      for (const fileId of fileIds) {
        const fileInfo = filesToDeleteFromR2R.get(fileId);
        if (fileInfo) {
          logger.info(`Deleting R2R document for file: ${fileInfo.filename} (R2R ID: ${fileInfo.r2r_id})`);
          try {
            await deleteR2RDocument(fileInfo.r2r_id, logger, env);
            // Remove from map after successful deletion
            filesToDeleteFromR2R.delete(fileId);
          } catch (error) {
            logger.error(`Failed to delete R2R document ${fileInfo.r2r_id}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error(`Error in R2R file deletion hook (${eventName}):`, error);
    }
  }

  async function deleteR2RDocument(r2rDocumentId: string, logger: any, env: any) {
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
      const deleteResponse = await client.documents.delete({
        id: r2rDocumentId,
      });

      if (deleteResponse.results?.success) {
        logger.info(`Successfully deleted R2R document: ${r2rDocumentId}`);
      } else {
        logger.warn(`R2R document deletion response was not successful: ${JSON.stringify(deleteResponse)}`);
      }
    } catch (error) {
      logger.error(`Error deleting R2R document ${r2rDocumentId}:`, error);
      throw error;
    }
  }

  async function checkAndHandleRetryFiles(env: any, logger: any, services: any, getSchema: () => Promise<any>) {
    try {
      const { FilesService, FoldersService } = services;
      const schema = await getSchema();

      // Initialize services with admin privileges
      const filesService = new FilesService({
        schema,
        accountability: { admin: true },
      });

      const foldersService = new FoldersService({
        schema,
        accountability: { admin: true },
      });

      // Find the R2R folder
      const r2rFolders = await foldersService.readByQuery({
        filter: {
          name: { _eq: "R2R" },
          parent: { _null: true },
        },
        limit: 1,
      });

      if (r2rFolders.length === 0) {
        logger.debug("R2R folder not found, skipping retry check");
        return;
      }

      const r2rFolderId = r2rFolders[0].id;

      // Find files in R2R folder that have retry set to true
      const retryFiles = await filesService.readByQuery({
        filter: {
          folder: { _eq: r2rFolderId },
          retry: { _eq: true },
          _or: [
            { filename_download: { _ends_with: ".md" } },
            { filename_download: { _ends_with: ".markdown" } },
          ],
        },
        limit: -1, // Process all retry files
      });

      if (retryFiles.length === 0) {
        logger.debug("No retry files found in R2R folder");
        return;
      }

      logger.info(`Found ${retryFiles.length} files marked for retry in R2R folder`);

      // Process each retry file
      for (const file of retryFiles) {
        try {
          logger.info(`Processing retry for file: ${file.filename_download}`);

          // If the file has an r2r_id, delete it from R2R first
          if (file.r2r_id) {
            logger.info(`Deleting existing R2R document for retry: ${file.r2r_id}`);
            await deleteR2RDocument(file.r2r_id, logger, env);
          }

          // Update the file record to clear retry flag and R2R-related fields
          await filesService.updateOne(file.id, {
            retry: false,
            r2r_id: null,
            r2r_ingestion_status: null,
            r2r_extraction_status: null,
          });

          logger.info(`Successfully reset file for retry: ${file.filename_download}`);
        } catch (error) {
          logger.error(`Failed to process retry for file ${file.filename_download}:`, error);
          // Continue with other files even if one fails
        }
      }
    } catch (error) {
      logger.error("Error checking and handling retry files:", error);
    }
  }

  async function checkAndSyncR2RFiles(env: any, logger: any, services: any, getSchema: () => Promise<any>) {
    try {
      const { FilesService, FoldersService } = services;
      const schema = await getSchema();

      // Initialize services with admin privileges
      const filesService = new FilesService({
        schema,
        accountability: { admin: true },
      });

      const foldersService = new FoldersService({
        schema,
        accountability: { admin: true },
      });

      // Find the R2R folder
      const r2rFolders = await foldersService.readByQuery({
        filter: {
          name: { _eq: "R2R" },
          parent: { _null: true },
        },
        limit: 1,
      });

      if (r2rFolders.length === 0) {
        logger.debug("R2R folder not found, skipping sync check");
        return;
      }

      const r2rFolderId = r2rFolders[0].id;

      // Find markdown files in R2R folder that haven't been synced yet (r2r_id is null)
      const unsyncedFiles = await filesService.readByQuery({
        filter: {
          folder: { _eq: r2rFolderId },
          r2r_id: { _null: true },
          _or: [
            { filename_download: { _ends_with: ".md" } },
            { filename_download: { _ends_with: ".markdown" } },
          ],
        },
        limit: 10, // Process up to 10 files at a time to reduce concurrency issues
      });

      if (unsyncedFiles.length === 0) {
        logger.debug("No unsynced markdown files found in R2R folder");
        return;
      }

      logger.info(`Found ${unsyncedFiles.length} unsynced markdown files in R2R folder`);

      // Process each unsynced file
      for (const file of unsyncedFiles) {
        try {
          // Check if file is already being processed (within the last 10 minutes)
          const processingStartTime = processingFiles.get(file.id);
          if (processingStartTime && Date.now() - processingStartTime < 600000) { // 10 minutes
            logger.debug(`File ${file.filename_download} is already being processed, skipping`);
            continue;
          }

          // Mark file as being processed with current timestamp
          processingFiles.set(file.id, Date.now());

          logger.info(`Syncing markdown file to R2R: ${file.filename_download}`);
          await syncFileToR2R(file as any, filesService, logger, env);
        } catch (error) {
          logger.error(`Failed to sync file ${file.filename_download}:`, error);
          // Continue with other files even if one fails
        } finally {
          // Clean up processing state
          processingFiles.delete(file.id);
        }
      }
    } catch (error) {
      logger.error("Error checking for R2R files to sync:", error);
    }
  }

  async function checkAndUpdateR2RStatusFields(env: any, logger: any, services: any, getSchema: () => Promise<any>) {
    try {
      const { FilesService, FoldersService } = services;
      const schema = await getSchema();

      // Initialize services with admin privileges
      const filesService = new FilesService({
        schema,
        accountability: { admin: true },
      });

      const foldersService = new FoldersService({
        schema,
        accountability: { admin: true },
      });

      // Find the R2R folder
      const r2rFolders = await foldersService.readByQuery({
        filter: {
          name: { _eq: "R2R" },
          parent: { _null: true },
        },
        limit: 1,
      });

      if (r2rFolders.length === 0) {
        logger.debug("R2R folder not found, skipping status check");
        return;
      }

      const r2rFolderId = r2rFolders[0].id;

      // Find files in R2R folder that have r2r_id but need status update
      // Only check files that don't already have both statuses as "success"
      const syncedFiles = await filesService.readByQuery({
        filter: {
          folder: { _eq: r2rFolderId },
          r2r_id: { _nnull: true },
          _and: [
            {
              _or: [
                { filename_download: { _ends_with: ".md" } },
                { filename_download: { _ends_with: ".markdown" } },
              ],
            },
            {
              _or: [
                { r2r_ingestion_status: { _neq: "success" } },
                { r2r_ingestion_status: { _null: true } },
                { r2r_extraction_status: { _neq: "success" } },
                { r2r_extraction_status: { _null: true } },
              ],
            },
          ],
        },
        limit: -1, // Process all files at a time
      });

      if (syncedFiles.length === 0) {
        logger.debug("No synced files found in R2R folder to check status");
        return;
      }

      logger.info(`Found ${syncedFiles.length} synced files to check status in R2R folder`);

      // Process each synced file to update status
      for (const file of syncedFiles) {
        try {
          logger.debug(`Checking R2R status for file: ${file.filename_download}`);
          await updateR2RStatus(file as any, filesService, logger, env);
        } catch (error) {
          logger.error(`Failed to update R2R status for file ${file.filename_download}:`, error);
          // Continue with other files even if one fails
        }
      }
    } catch (error) {
      logger.error("Error checking R2R status fields:", error);
    }
  }

  async function updateR2RStatus(file: any, filesService: any, logger: any, env: any) {
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

      // Retrieve document status from R2R using SDK
      logger.debug(`Retrieving document status from R2R for document ID: ${file.r2r_id}`);

      let documentData;
      try {
        documentData = await client.documents.retrieve({
          id: file.r2r_id,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Status 409") && error.message.includes("currently ingesting")) {
          // Document is currently being processed - skip status update for now
          logger.debug(`Document ${file.r2r_id} is currently being processed, skipping status update`);
          return;
        }
        // Re-throw other errors
        throw error;
      }

      // Extract status information
      const ingestionStatus = documentData.results?.ingestionStatus;
      const extractionStatus = documentData.results?.extractionStatus;

      if (ingestionStatus !== undefined || extractionStatus !== undefined) {
        // Prepare update object
        const updateData: any = {};

        if (ingestionStatus !== undefined && ingestionStatus !== file.r2r_ingestion_status) {
          updateData.r2r_ingestion_status = ingestionStatus;
        }

        if (extractionStatus !== undefined && extractionStatus !== file.r2r_extraction_status) {
          updateData.r2r_extraction_status = extractionStatus;
        }

        // Only update if there are changes
        if (Object.keys(updateData).length > 0) {
          await filesService.updateOne(file.id, updateData);

          logger.info(`Updated R2R status for file ${file.filename_download}: ingestion=${ingestionStatus}, extraction=${extractionStatus}`);
        }
      } else {
        logger.warn(`No status information found in R2R response for file ${file.filename_download}`);
      }
    } catch (error) {
      console.log(error);

      logger.error(`Error updating R2R status for file ${file.filename_download}:`, error);
      throw error;
    }
  }

  async function syncFileToR2R(file: any, filesService: any, logger: any, env: any) {
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
        logger.warn("No collections found in R2R, uploading document without collection assignment");
      }

      let targetCollectionId = null;
      if (collectionsResponse.results && collectionsResponse.results.length > 0) {
        // Find collection with largest document_count
        const largestCollection = collectionsResponse.results.reduce((prev: any, current: any) => {
          const prevCount = (prev as any).document_count || (prev as any).documentCount || 0;
          const currentCount = (current as any).document_count || (current as any).documentCount || 0;
          return prevCount > currentCount ? prev : current;
        });

        targetCollectionId = (largestCollection as any).id;
        const documentCount = (largestCollection as any).document_count || (largestCollection as any).documentCount || 0;
        logger.info(`Selected collection with largest document count: ${(largestCollection as any).name} (ID: ${targetCollectionId}, document_count: ${documentCount})`);
      }

      // Get file content by making a request to the assets endpoint
      const response = await fetch(`${config.api.baseUrl}/assets/${file.id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch file content: ${response.statusText}`);
      }
      const fileContent = await response.text();

      // Create a temporary file path for R2R
      const tempFilePath = `/tmp/${file.filename_download}`;
      writeFileSync(tempFilePath, fileContent);

      let documentResult;
      try {
        // Upload document to R2R
        logger.info(`Uploading document to R2R: ${file.filename_download}`);

        const createParams: any = {
          file: { path: tempFilePath, name: file.filename_download },
          metadata: {
            title: file.title || file.filename_download,
            description: file.description || `Markdown file: ${file.filename_download}`,
            directus_file_id: file.id,
            filename: file.filename_download,
          },
        };

        // Add collectionIds if we found a target collection
        if (targetCollectionId) {
          createParams.collectionIds = [ targetCollectionId ];
          logger.debug(`Adding document to collection: ${targetCollectionId}`);
        }

        try {
          documentResult = await client.documents.create(createParams);
        } catch (error) {
          // Check if this is a 409 error (document already exists)
          if (error instanceof Error && error.message.includes("Status 409") && error.message.includes("already exists")) {
            logger.warn(`Document already exists in R2R, attempting to delete and retry: ${file.filename_download}`);

            // Extract document ID from error message
            // Error format: "Status 409: Document {document_id} already exists. Submit a DELETE request..."
            const documentIdMatch = error.message.match(/Document ([a-f0-9-]+) already exists/);

            if (documentIdMatch && documentIdMatch[1]) {
              const existingDocumentId = documentIdMatch[1];
              logger.info(`Extracted existing document ID: ${existingDocumentId}`);

              try {
                // Delete the existing document
                logger.info(`Deleting existing R2R document: ${existingDocumentId}`);
                await client.documents.delete({ id: existingDocumentId });
                logger.info(`Successfully deleted existing R2R document: ${existingDocumentId}`);

                // Retry the upload
                logger.info(`Retrying upload for document: ${file.filename_download}`);
                documentResult = await client.documents.create(createParams);
                logger.info(`Successfully uploaded document after deletion: ${file.filename_download}`);
              } catch (deleteError) {
                logger.error(`Failed to delete existing document or retry upload: ${deleteError}`);
                throw deleteError;
              }
            } else {
              logger.error(`Could not extract document ID from error message: ${error.message}`);
              throw error;
            }
          } else if (error instanceof Error && error.message.includes("Status 409") && error.message.includes("currently ingesting")) {
            // Document is currently being processed - skip this file and let the current process complete
            logger.warn(`Document is currently being processed in R2R, skipping: ${file.filename_download}`);
            return; // Exit early, don't update the file record
          } else {
            // Re-throw other errors
            throw error;
          }
        }

        logger.info(`Document uploaded to R2R successfully: ${JSON.stringify(documentResult)}`);

        // Extract document ID from response
        const documentId = documentResult.results.documentId;

        if (documentId) {
          // Update the file record in Directus with the R2R document ID
          await filesService.updateOne(file.id, {
            r2r_id: documentId,
          });

          logger.info(`Updated Directus file record with R2R document ID: ${documentId}`);
        } else {
          logger.error("No document ID returned from R2R");
          logger.error(`Full R2R response: ${JSON.stringify(documentResult)}`);
        }
      } finally {
        // Clean up temporary file - use try-catch to handle case where file might not exist
        try {
          unlinkSync(tempFilePath);
        } catch (unlinkError) {
          // Only log if it's not a "file not found" error
          if ((unlinkError as any).code !== "ENOENT") {
            logger.warn(`Failed to cleanup temporary file ${tempFilePath}:`, unlinkError);
          }
        }
      }
    } catch (error) {
      console.log(error);

      logger.error("Error syncing file to R2R:", error);
      throw error;
    }
  }
});
