import { defineEndpoint } from "@directus/extensions-sdk";

export default defineEndpoint({
  id: "adoption-details",

  handler: (router, { services, getSchema }) => {
    router.get("/", async (_req, res) => {
      try {
        const schema = await getSchema();
        const { ItemsService } = services;
        const settingsService = new ItemsService("settings", { schema });

        // Fetch the adoption_details setting
        const adoptionDetailsSettings = await settingsService.readByQuery({
          filter: { key: { _eq: "adoption_details" } },
          limit: 1,
          fields: [ "key", "value" ],
        });

        if (adoptionDetailsSettings.length === 0 || !adoptionDetailsSettings[0]) {
          return res.status(404).json({
            error: "Adoption details not found",
            message: "The adoption_details setting does not exist yet. The sync job may not have run.",
          });
        }

        const adoptionDetailsValue = adoptionDetailsSettings[0].value;

        // Parse the JSON value
        let parsedDetails;
        try {
          parsedDetails = JSON.parse(adoptionDetailsValue);
        } catch (parseError) {
          return res.status(500).json({
            error: "Invalid JSON format",
            message: "The adoption_details value is not valid JSON",
            raw: adoptionDetailsValue,
          });
        }

        // Return the parsed adoption details
        return res.json({
          success: true,
          data: parsedDetails,
          count: Array.isArray(parsedDetails) ? parsedDetails.length : 0,
        });
      } catch (error) {
        console.error("[Adoption Details Endpoint] Error:", error);
        return res.status(500).json({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    });
  },
});
