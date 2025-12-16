-- Upgrade Plan: Automated News Search and Deduplication
-- Milestone 1: Database Schema Updates

-- 1. Create table for Scheduled Searches
CREATE TABLE IF NOT EXISTS "scheduled_searches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic" VARCHAR(255) NOT NULL,
    "perplexity_query_base" TEXT NOT NULL,
    "interval_hours" INTEGER NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_searches_pkey" PRIMARY KEY ("id")
);

-- Add a unique constraint on topic to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_searches_topic_key" ON "scheduled_searches"("topic");

-- 2. Create table for Search Logs
CREATE TABLE IF NOT EXISTS "search_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topic_searched" VARCHAR(255) NOT NULL,
    "time_span_used" VARCHAR(50) NOT NULL,
    "raw_response" JSONB NOT NULL,
    "items_found" INTEGER NOT NULL,
    "items_processed" INTEGER NOT NULL,
    "status" VARCHAR(50) NOT NULL, -- 'RAW_FETCHED', 'SUCCESS', 'FAILED', 'PARTIAL'
    "error_message" TEXT,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- Index for faster querying of logs by topic and time
CREATE INDEX IF NOT EXISTS "search_logs_topic_time_idx" ON "search_logs"("topic_searched", "execution_time");
