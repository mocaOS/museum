import { defineHook } from "@directus/extensions-sdk";
import type { Directus } from "@local/types";

export default defineHook(({ schedule }, { env, logger, services, getSchema }) => {
  logger.debug("Coolify Logs Sync hook is being initialized");

  const COOLIFY_API = "https://deploy.qwellco.de/api/v1";
  const COOLIFY_TOKEN = env.COOLIFY_TOKEN;

  // Store logs for each application with timestamp of first occurrence
  interface LogEntry {
    logs: string;
    firstSeenAt: number;
  }
  const applicationLogs = new Map<string, LogEntry>();

  // Schedule a task to fetch logs from all Coolify applications every minute
  schedule("0 * * * * *", async () => {
    try {
      logger.info("Starting Coolify logs sync task");

      // Get schema and services
      const schema = await getSchema();
      const { ItemsService } = services;

      // Initialize applications service with admin privileges
      const applicationsService = new ItemsService("applications", {
        schema,
        accountability: null,
      });

      // Fetch all applications that have a Coolify application_id
      const applications = await applicationsService.readByQuery({
        filter: {
          application_id: { _nnull: true },
        },
        limit: -1,
        fields: [ "id", "application_id", "url", "status" ],
      });

      if (!applications || applications.length === 0) {
        logger.debug("No applications with Coolify application_id found");
        return;
      }

      logger.info(`Found ${applications.length} Coolify applications, fetching logs...`);

      // Fetch logs for each application
      for (const app of applications as Directus.Applications[]) {
        const applicationUuid = app.application_id;

        if (!applicationUuid) {
          continue;
        }

        try {
          // Fetch logs from Coolify API with 10 lines
          const logsUrl = `${COOLIFY_API}/applications/${applicationUuid}/logs?lines=10`;
          const response = await fetch(logsUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${COOLIFY_TOKEN}`,
            },
          });

          if (!response.ok) {
            logger.warn(`Failed to fetch logs for application ${applicationUuid} (${app.url}): ${response.status} ${response.statusText}`);
            continue;
          }

          const data = await response.json();
          const logs = data?.logs || "";

          if (logs) {
            logger.info(`\n=== Logs for application ${app.url} (${applicationUuid}) ===`);
            logger.info(`Status: ${app.status || "unknown"}`);
            logger.info("Latest 10 lines:");
            logger.info(logs);
            logger.info("=== End of logs ===\n");

            // Check if logs have changed
            const existingEntry = applicationLogs.get(applicationUuid);
            const now = Date.now();

            if (existingEntry) {
              // Logs exist, check if they're the same
              if (existingEntry.logs === logs) {
                const elapsedMinutes = (now - existingEntry.firstSeenAt) / (1000 * 60);

                logger.debug(`Logs unchanged for application ${applicationUuid} for ${elapsedMinutes.toFixed(2)} minutes`);

                // If logs haven't changed for 12h minutes, stop the application
                if (elapsedMinutes >= 12 * 60) {
                  logger.warn(`Logs unchanged for ${elapsedMinutes.toFixed(2)} minutes for application ${applicationUuid} (${app.url}). Stopping application...`);

                  try {
                    const stopUrl = `${COOLIFY_API}/applications/${applicationUuid}/stop`;
                    const stopResponse = await fetch(stopUrl, {
                      method: "GET",
                      headers: {
                        Authorization: `Bearer ${COOLIFY_TOKEN}`,
                      },
                    });

                    if (stopResponse.ok) {
                      logger.info(`Successfully stopped application ${applicationUuid} (${app.url})`);

                      // Update status in database
                      await applicationsService.updateOne(app.id, { status: "offline" } as Partial<Directus.Applications>);

                      // Clear the log entry
                      applicationLogs.delete(applicationUuid);
                    } else {
                      logger.error(`Failed to stop application ${applicationUuid}: ${stopResponse.status} ${stopResponse.statusText}`);
                    }
                  } catch (stopError) {
                    logger.error(`Error stopping application ${applicationUuid}:`, stopError);
                  }
                }
              } else {
                // Logs have changed, reset the timer
                logger.debug(`Logs changed for application ${applicationUuid}, resetting timer`);
                applicationLogs.set(applicationUuid, { logs, firstSeenAt: now });
              }
            } else {
              // First time seeing logs for this application
              logger.debug(`First log entry for application ${applicationUuid}`);
              applicationLogs.set(applicationUuid, { logs, firstSeenAt: now });
            }
          } else {
            logger.debug(`No logs available for application ${applicationUuid} (${app.url})`);
          }
        } catch (error) {
          logger.error(`Error fetching logs for application ${applicationUuid} (${app.url}):`, error);
        }
      }

      logger.info("Coolify logs sync task completed");
    } catch (error) {
      logger.error("Error in scheduled Coolify logs sync task:", error);
    }
  });
});
