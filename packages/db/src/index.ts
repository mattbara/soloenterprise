/**
 * Database Connection
 * 
 * Uses Neon's serverless driver for PostgreSQL.
 * Connection string comes from environment variable.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

// Validate environment
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create Neon client
const sql = neon(databaseUrl);

// Create Drizzle instance with schema
export const db = drizzle(sql, { schema });

// Export types for use elsewhere
export type Database = typeof db;

// Re-export schema for convenience
export * from './schema.js';
