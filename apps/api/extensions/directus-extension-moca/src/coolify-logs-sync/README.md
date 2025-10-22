# Coolify Logs Sync Hook

This hook automatically fetches application logs from Coolify for all registered applications every minute and monitors for stale applications.

## Features

- **Scheduled Execution**: Runs every minute using cron schedule `0 * * * * *`
- **Automatic Discovery**: Fetches all applications from the `applications` table that have a `application_id` (Coolify UUID)
- **Log Streaming**: Retrieves the latest 10 lines of logs for each application
- **Console Logging**: Outputs logs in a formatted manner to the console
- **Stale Application Detection**: Tracks log changes over time and automatically stops applications with unchanged logs for 5+ minutes
- **Automatic Cleanup**: Updates application status in the database and clears tracking data after stopping

## Configuration

The hook requires the following environment variable:

- `COOLIFY_TOKEN`: Bearer token for authenticating with the Coolify API

## How It Works

1. Every minute, the hook queries the `applications` table for all entries with a non-null `application_id`
2. For each application found, it makes a GET request to the Coolify API:
   ```
   GET https://deploy.qwellco.de/api/v1/applications/{uuid}/logs?lines=10
   ```
3. The logs are formatted and printed to the console with application details:
   - Application URL
   - Application UUID
   - Current status
   - Latest 10 log lines

4. **Log Change Detection**:
   - The hook stores the latest logs for each application along with a timestamp
   - On each run, it compares the current logs with the stored logs
   - If logs are identical to the previous run, it tracks how long they've been unchanged
   - If logs change, the timer resets

5. **Automatic Application Stopping**:
   - If an application's logs remain unchanged for 5 minutes or more, the hook automatically stops the application
   - Makes a stop request: `GET https://deploy.qwellco.de/api/v1/applications/{uuid}/stop`
   - Updates the application status to "offline" in the database
   - Clears the tracking data for that application

## Log Output Format

```
=== Logs for application https://example.deploy.qwellco.de (abc-123-xyz) ===
Status: online
Latest 10 lines:
[log line 1]
[log line 2]
[log line 3]
[log line 4]
[log line 5]
[log line 6]
[log line 7]
[log line 8]
[log line 9]
[log line 10]
=== End of logs ===
```

When logs remain unchanged for a certain period:
```
Logs unchanged for application abc-123-xyz for 3.42 minutes
```

When an application is stopped due to stale logs:
```
Logs unchanged for 5.00 minutes for application abc-123-xyz (https://example.deploy.qwellco.de). Stopping application...
Successfully stopped application abc-123-xyz (https://example.deploy.qwellco.de)
```

## Error Handling

- If an application's logs cannot be fetched, a warning is logged and processing continues with the next application
- If the Coolify API returns an error, it's logged but doesn't stop the entire sync process
- Any general errors during the sync task are caught and logged

## Database Schema

The hook reads from the `applications` table which has the following structure:

```typescript
export type Applications = {
  application_id?: string | null;  // Coolify application UUID
  decc0s?: string | null;
  id: number;
  owner?: string | DirectusUsers | null;
  status?: string | null;
  url?: string | null;
};
```

## API Reference

This hook uses the [Coolify API endpoint for fetching application logs](https://coolify.io/docs/api-reference/api/operations/get-application-logs-by-uuid).

## Notes

- The hook runs with admin privileges to access all applications regardless of user permissions
- Only applications with a valid `application_id` are processed
- The number of log lines is fixed at 10 but can be adjusted in the code
- Log comparison is based on exact string matching - any change in logs will reset the timer
- The 5-minute threshold for stopping applications can be adjusted in the code
- Applications are only stopped if they are online/running - offline applications are ignored
- After stopping an application, its tracking data is cleared to avoid duplicate stop requests

