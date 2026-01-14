# Rate Limits Table

## Automatic Table Creation

The `rate_limits` table is **automatically created** by the `rate-limiter-flexible` library when the `RateLimiterPostgres` instance is first initialized.

### How It Works

1. **First Request**: When the first request hits a route with `rateLimit` middleware, the library checks if the table exists
2. **Auto-Creation**: If the table doesn't exist, it automatically creates it with the correct schema
3. **No Migration Needed**: You don't need to create a Drizzle migration for this table

### Table Schema

The `rate-limiter-flexible` library creates a table with this structure:

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key VARCHAR(255) PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 0,
  expire INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expire ON rate_limits(expire);
```

### Why No Drizzle Migration?

1. **Library Management**: The `rate-limiter-flexible` library manages the table lifecycle
2. **Schema Changes**: If the library updates its schema, it handles migrations automatically
3. **Avoid Conflicts**: Manual Drizzle migrations could conflict with the library's internal management
4. **Flexibility**: The library can optimize the table structure for its specific use case

### Table Cleanup

The library automatically:
- **Expires old entries** based on the `expire` timestamp
- **Cleans up** expired records during normal operations
- **Manages TTL** without requiring manual intervention

### Testing

For testing purposes, you can clear the table:

```sql
-- Clear all rate limits (for testing only)
TRUNCATE TABLE rate_limits;
```

Or use the test helper script:

```bash
# Clear rate limits before testing
pnpm tsx scripts/clear-rate-limits.ts
```

### Production Considerations

- ✅ **No action needed**: The table is created automatically on first use
- ✅ **Distributed**: Works across multiple server instances
- ✅ **Persistent**: Survives server restarts
- ✅ **Self-managing**: Library handles cleanup and optimization
