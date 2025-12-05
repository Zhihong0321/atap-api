# Admin Dashboard & News API Documentation

## Base URL
`https://api-atap-solar-production.up.railway.app`

## Authentication
All Admin endpoints require the `Authorization` header (Bearer Token).

---

## 1. News Task Manager (Admin)

### List All Query Tasks
**GET** `/news-tasks`
- **Response**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "query": "Malaysia Solar News",
        "status": "pending | running | completed | failed",
        "created_at": "2024-12-05T10:00:00Z"
        ...
      }
    ]
  }
  ```

### Get Single Task
**GET** `/news-tasks/:id`
- **Response**: Task Object

### Create Query Task
**POST** `/news-tasks`
- **Body**:
  ```json
  {
    "query": "Solar Policy 2025",
    "account_name": "optional-account",
    "collection_uuid": "optional-uuid"
  }
  ```

### Update Query Task
**PUT** `/news-tasks/:id`
- **Body** (all fields optional):
  ```json
  {
    "query": "Updated Query String"
  }
  ```

### Manual Trigger (Run Task)
**POST** `/news-tasks/:id/run`
- **Description**: Manually triggers the Perplexity crawler for this task.
- **Response**:
  ```json
  {
    "taskId": "uuid",
    "leads": [ ... ], 
    "news": [ ... ]
  }
  ```

### Delete Task
**DELETE** `/news-tasks/:id`
- **Description**: Deletes the task and its associated leads (cascading delete logic handled in code).
- **Response**: `204 No Content`

---

## 2. News Management (Content)

### List News (Public / Admin Filter)
**GET** `/news`
- **Query Parameters**:
  - `limit`: (default 20)
  - `offset`: (default 0)
  - `published`: `true` | `false`
  - `highlight`: `true` | `false`
  - `content_status`: `empty` | `filled`
    - `empty`: Returns news that only has a headline (content starts with "Pending rewrite for:").
    - `filled`: Returns news with actual content.

- **Response**:
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "title_en": "Headline",
        "content_en": "Content...",
        "news_date": "2025-01-01T00:00:00Z",
        "is_published": true
        ...
      }
    ]
  }
  ```

### Get News Detail
**GET** `/news/:id`

### Update News Content (Admin)
**PUT** `/news/:id`
- **Body**:
  ```json
  {
    "title_en": "New Title",
    "content_en": "Rewritten full content...",
    "is_published": true
  }
  ```

### Publish/Highlight Toggle (Admin)
**PATCH** `/news/:id/publish`
- **Body**:
  ```json
  {
    "is_published": true,
    "is_highlight": false
  }
  ```
