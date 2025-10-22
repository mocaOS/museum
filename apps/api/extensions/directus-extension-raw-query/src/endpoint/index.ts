import { defineEndpoint } from "@directus/extensions-sdk";
import { createError } from "@directus/errors";

const ForbiddenError = createError("FORBIDDEN", "Only administrators can execute raw queries", 403);
const BadRequestError = createError("BAD_REQUEST", "Query is required", 400);

export default defineEndpoint({
  id: "raw-query",
  handler: (router, context) => {
    const { database } = context;

    // Endpoint to fetch database schema for autocomplete
    router.get("/schema", async (req, res) => {
      try {
        // Check if user is authenticated
        if (!req.accountability) {
          throw new ForbiddenError();
        }

        // Check if user is admin
        if (!req.accountability.admin) {
          throw new ForbiddenError();
        }

        // Get database client type
        const client = database.client.config.client;

        let tables = [];

        if (client === "pg" || client === "postgres") {
          // PostgreSQL
          const result = await database.raw(`
            SELECT 
              table_name,
              column_name,
              data_type,
              is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
          `);

          const columns = result.rows || result;
          const tableMap = new Map();

          columns.forEach((col: any) => {
            if (!tableMap.has(col.table_name)) {
              tableMap.set(col.table_name, { name: col.table_name, columns: [] });
            }
            tableMap.get(col.table_name).columns.push({
              name: col.column_name,
              type: col.data_type,
              nullable: col.is_nullable === "YES",
            });
          });

          tables = Array.from(tableMap.values());
        } else if (client === "mysql" || client === "mysql2") {
          // MySQL
          const result = await database.raw(`
            SELECT 
              TABLE_NAME as table_name,
              COLUMN_NAME as column_name,
              DATA_TYPE as data_type,
              IS_NULLABLE as is_nullable
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
            ORDER BY table_name, ordinal_position
          `);

          const columns = result[0] || result;
          const tableMap = new Map();

          columns.forEach((col: any) => {
            if (!tableMap.has(col.table_name)) {
              tableMap.set(col.table_name, { name: col.table_name, columns: [] });
            }
            tableMap.get(col.table_name).columns.push({
              name: col.column_name,
              type: col.data_type,
              nullable: col.is_nullable === "YES",
            });
          });

          tables = Array.from(tableMap.values());
        } else {
          // Fallback for other databases
          const result = await database.raw(`
            SELECT 
              table_name,
              column_name,
              data_type
            FROM information_schema.columns
            ORDER BY table_name
          `);

          const columns = result.rows || result[0] || result;
          const tableMap = new Map();

          columns.forEach((col: any) => {
            if (!tableMap.has(col.table_name)) {
              tableMap.set(col.table_name, { name: col.table_name, columns: [] });
            }
            tableMap.get(col.table_name).columns.push({
              name: col.column_name,
              type: col.data_type,
              nullable: true,
            });
          });

          tables = Array.from(tableMap.values());
        }

        res.json({
          success: true,
          tables,
        });
      } catch (error: any) {
        if (error.extensions) {
          res.status(error.extensions.code || 500).json({
            success: false,
            error: error.message,
          });
        } else {
          res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch schema",
          });
        }
      }
    });

    router.post("/execute", async (req, res) => {
      try {
        // Check if user is authenticated
        if (!req.accountability) {
          throw new ForbiddenError();
        }

        // Check if user is admin
        if (!req.accountability.admin) {
          throw new ForbiddenError();
        }

        const { query } = req.body;

        if (!query || typeof query !== "string") {
          throw new BadRequestError();
        }

        // Split queries by semicolon to handle multiple queries
        const queries = query
          .split(";")
          .map(q => q.trim())
          .filter(q => q.length > 0);

        const results = [];

        for (const singleQuery of queries) {
          try {
            // Execute the raw query
            const result = await database.raw(singleQuery);

            // Different databases return results differently
            // PostgreSQL returns result.rows, MySQL returns result[0]
            let data;
            if (result.rows) {
              data = result.rows; // PostgreSQL
            } else if (Array.isArray(result)) {
              data = result[0]; // MySQL
            } else {
              data = result;
            }

            results.push({
              query: singleQuery,
              success: true,
              data,
              rowCount: Array.isArray(data) ? data.length : 0,
            });
          } catch (error: any) {
            results.push({
              query: singleQuery,
              success: false,
              error: error.message || "Unknown error",
            });
          }
        }

        res.json({
          success: true,
          results,
        });
      } catch (error: any) {
        if (error.extensions) {
          // Directus error
          res.status(error.extensions.code || 500).json({
            success: false,
            error: error.message,
          });
        } else {
          res.status(500).json({
            success: false,
            error: error.message || "Internal server error",
          });
        }
      }
    });
  },
});
