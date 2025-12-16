# Upgrade Plan: Automated News Search and Deduplication

This document outlines the phased upgrade plan for implementing automated news searches with deduplication and a robust logging system, designed for a serverless environment like Railway.

---

## Milestone 1: Database Schema Updates

Introduce new tables to manage search schedules and log search activities.

### 1.1 `search_logs` Table
This table will store comprehensive logs for each news search execution.

*   **Purpose:** To provide a robust, auditable record of all search operations, including raw responses from Perplexity, for analysis and fine-tuning.
*   **Schema:**
    *   `id`: UUID (Primary Key, unique identifier for each log entry)
    *   `execution_time`: TIMESTAMP (NOT NULL, records when the search was executed)
    *   `topic_searched`: VARCHAR(255) (NOT NULL, the specific topic queried, e.g., "Solar Malaysia")
    *   `time_span_used`: VARCHAR(50) (NOT NULL, the time constraint used in the Perplexity query, e.g., "72h", "last 3 days")
    *   `raw_response`: JSONB (NOT NULL, stores the full JSON array of headlines/metadata returned by Perplexity *before* any filtering)
    *   `items_found`: INTEGER (NOT NULL, count of articles returned by Perplexity before filtering)
    *   `items_processed`: INTEGER (NOT NULL, count of *unique* articles that passed deduplication and were sent for deep research/storage)
    *   `status`: VARCHAR(50) (e.g., 'SUCCESS', 'FAILED', 'PARTIAL')
    *   `error_message`: TEXT (Optional, stores error details if the search failed or had issues)

### 1.2 `scheduled_searches` Table
This table will define and track the schedule for each news topic.

*   **Purpose:** To configure which topics to search for, how frequently, and to keep track of their last execution time for scheduling purposes.
*   **Schema:**
    *   `id`: UUID (Primary Key, unique identifier for each scheduled search configuration)
    *   `topic`: VARCHAR(255) (NOT NULL, UNIQUE, the news topic to be searched)
    *   `perplexity_query_base`: TEXT (NOT NULL, the base query string for Perplexity, e.g., "news about {topic}")
    *   `interval_hours`: INTEGER (NOT NULL, the desired frequency in hours for this topic's search, e.g., 72)
    *   `last_run_at`: TIMESTAMP (NULLABLE initially, but updated after each run, indicates the last successful execution time)
    *   `active`: BOOLEAN (NOT NULL, DEFAULT TRUE, allows enabling/disabling a scheduled search)
    *   `created_at`: TIMESTAMP (NOT NULL, DEFAULT CURRENT_TIMESTAMP)
    *   `updated_at`: TIMESTAMP (NOT NULL, DEFAULT CURRENT_TIMESTAMP, updated on modification)

---

## Milestone 2: API Logic Upgrade (News Search Service)

Refactor the existing news search functionality into a dedicated service with enhanced logic for scheduling, deduplication, and logging.

### 2.1 Core Search Function Refactoring
The existing news search function will be enhanced to accept a `topic` and dynamically determine the `time_span`.

*   **Input:** `topic` (string, from `scheduled_searches.topic`), `last_run_at` (timestamp, from `scheduled_searches.last_run_at`), `interval_hours` (integer, from `scheduled_searches.interval_hours`)
*   **Output:** List of unique news articles ready for deep research/rewrite.

### 2.2 Dynamic Perplexity Prompt Engineering
Adjust the Perplexity API call to include a dynamic time constraint.

*   **Logic:**
    1.  Calculate `search_start_time`: `last_run_at` (if available, otherwise `NOW() - interval_hours`).
    2.  Construct Perplexity Query: "Find news about `{topic}` published after `{search_start_time.ISO_FORMAT}`. Ensure sources are distinct and relevant."
    *   *Note:* The `search_start_time` will be formatted appropriately for Perplexity (e.g., "YYYY-MM-DD HH:MM:SS").

### 2.3 Fetch & Log Raw Response
Integrate logging of the raw Perplexity response into the workflow.

*   **Logic:**
    1.  Execute Perplexity API call.
    2.  **Immediately** create an entry in `search_logs` with `execution_time`, `topic_searched`, `time_span_used`, `raw_response` (full JSON from Perplexity), `items_found`. Set `status` to 'RAW_FETCHED'.
    3.  Proceed with further processing. If subsequent steps fail, this log provides a complete record of the initial fetch.

### 2.4 Deduplication (Strict URL Check)
Implement the first layer of deduplication before costly processing.

*   **Logic:**
    1.  Extract URLs from the Perplexity `raw_response`.
    2.  Query the main `news` table (or whichever table stores processed articles) to check for existence of these URLs.
    3.  Filter out any articles whose URLs are already present in the database.
    4.  Update the `items_processed` count in the `search_logs` entry.

### 2.5 Article Processing & Storage
The filtered, unique articles are then sent for deep research, rewriting, translation, and final storage.

*   **Logic:**
    1.  For each unique article (that passed deduplication):
        *   Initiate deep research via Perplexity.
        *   Perform rewriting and translation.
        *   Store the final article in the main `news` table.
    2.  Update the `status` of the corresponding `search_logs` entry to 'SUCCESS' or 'PARTIAL' (if some articles failed).
    3.  If any errors occur during processing, log them in `search_logs.error_message`.

### 2.6 Update Scheduled Search Timestamp
After a successful search cycle for a topic, update its `last_run_at`.

*   **Logic:**
    1.  After all unique articles for a given topic have been processed (or the process has completed for that topic), update `scheduled_searches.last_run_at` to the current timestamp (`NOW()`).

---

## Milestone 3: Serverless Automation Strategy (External Heartbeat)

Implement an API endpoint that acts as a central scheduler, triggered by an external cron service (like Railway Cron).

### 3.1 `POST /api/scheduler/run-pending-tasks` Endpoint
This endpoint will be the entry point for scheduled task execution.

*   **Purpose:** To be externally callable by a cron job, waking up the serverless function and initiating the check for overdue tasks.
*   **Logic:**
    1.  **Authentication/Authorization (Optional but Recommended):** Implement a simple API key or secret check to prevent unauthorized calls.
    2.  **Query `scheduled_searches`:** Select all active entries from the `scheduled_searches` table where `(NOW() - last_run_at) > interval_hours`.
    3.  **Iterate and Execute:** For each overdue scheduled search:
        *   Call the refactored News Search Function (Milestone 2.1) using the topic details from the `scheduled_searches` entry.
        *   Handle any exceptions during individual topic processing gracefully (e.g., log the error for that topic and continue with others).
    4.  **Response:** Return a concise JSON response indicating which tasks were triggered or if no tasks were pending.

### 3.2 External Cron Job Configuration (Railway)
Configure Railway's built-in cron service (or an alternative like GitHub Actions/external cron service).

*   **Frequency:** Recommend running every `6 hours`. This frequency is sufficient to ensure 72-hour tasks are picked up reliably without excessive serverless wake-ups.
*   **Command:** `curl -X POST https://YOUR_APP_DOMAIN/api/scheduler/run-pending-tasks`
*   **Authentication:** If implemented, include headers for API key or secret.

---

## Milestone 4: Testing Plan (Post-Implementation)

Ensure the implemented solution works as expected without waiting for full intervals.

### 4.1 The "Time Travel" Test
Verify the system triggers a search when a task is overdue.

*   **Procedure:**
    1.  Manually insert or update a row in `scheduled_searches` for a test topic.
    2.  Set `interval_hours` to `72`.
    3.  Set `last_run_at` to `NOW() - INTERVAL '96 hours'` (4 days ago).
    4.  Manually hit the `/api/scheduler/run-pending-tasks` endpoint.
*   **Expected:** The system should trigger the search for this topic, log it in `search_logs`, and update `scheduled_searches.last_run_at` to `NOW()`.

### 4.2 The "Too Soon" Test
Verify the system correctly skips tasks that are not yet due.

*   **Procedure:**
    1.  Immediately after the "Time Travel" test (or creating a fresh scheduled entry with `last_run_at` as `NOW()`), manually hit the `/api/scheduler/run-pending-tasks` endpoint again.
*   **Expected:** The system should report "No pending tasks" for this topic and not trigger any new searches or update `last_run_at`.

### 4.3 The "Short Interval" Test
Verify the scheduling loop works for rapid iterations.

*   **Procedure:**
    1.  Manually insert or update a row in `scheduled_searches` for a test topic.
    2.  Set `interval_hours` to a very small value, e.g., `0.05` (3 minutes).
    3.  Set `last_run_at` to `NOW() - INTERVAL '4 minutes'` (or an earlier time).
    4.  Manually hit the `/api/scheduler/run-pending-tasks` endpoint.
    5.  Wait for 5 minutes.
    6.  Hit the endpoint again.
*   **Expected:** The system should trigger the search in both calls, logging each execution and updating `last_run_at` appropriately.

---
