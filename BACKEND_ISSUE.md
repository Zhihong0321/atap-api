# Backend Issue Report

**Severity**: Critical  
**Impact**: Application is completely non-functional for news data retrieval.

## Issue Description
The production API endpoint `https://atap-api-production.up.railway.app/api/v1/news` is returning a **500 Internal Server Error**.

## Diagnostics
- **URL**: `https://atap-api-production.up.railway.app/api/v1/news`
- **Method**: `GET`
- **Status Code**: `500 Internal Server Error`
- **Response Body**:
  ```json
  {
    "statusCode": 500,
    "code": "P2021",
    "error": "Internal Server Error",
    "message": "\nInvalid `prisma.news.findMany()` invocation:\n\n\nThe table `public.News` does not exist in the current database."
  }
  ```

## Root Cause
The Prisma error `P2021` indicates that the database schema is out of sync with the application code. Specifically, the table `public.News` is missing from the connected database instance.

## Action Required
1.  **Verify Database Connection**: Ensure the API is connected to the correct database instance.
2.  **Run Migrations**: Execute `npx prisma migrate deploy` (or equivalent) to create the missing tables.
3.  **Verify Schema**: Confirm that the `News` table exists in the `public` schema.

## Status
Frontend mock data fallbacks have been **removed** to expose this error as requested. The application will show an empty state or error message until the backend is fixed.
