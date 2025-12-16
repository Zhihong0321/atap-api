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
    "collection_uuid": "optional-uuid",
    "category_id": "uuid-of-existing-category"
  }
  ```
- **Required Fields**: `query`
- **Optional Fields**: `account_name`, `collection_uuid`, `category_id` (to categorize all news generated from this task)

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

### Upload/Set News Image (Admin)
**POST** `/news/:id/image`
- **Body**:
  ```json
  {
    "image_base64": "data:image/png;base64,...." ,
    "filename": "optional.png",
    "content_type": "image/png"
  }
  ```
- **Behavior**: Saves the uploaded image to server storage and updates `image_url` for the news item.
- **Response**:
  ```json
  {
    "image_url": "https://cdn.example.com/uploads/news/abc.png",
    "stored_as": "abc.png"
  }
  ```

### Rewrite a Single News Item (Admin)
**POST** `/news/:id/rewrite`
- **Description**: Rewrites the specified news item using the News Rewriter (Perplexity) and updates its content, image, sources, and tags.
- **Response**:
  ```json
  {
    "news": { /* updated news object */ },
    "rewrite": { /* raw rewriter response (meta, article, tags, source_urls) */ }
  }
  ```

---

## 3. Categories (Admin)

### List Categories
**GET** `/categories`
- **Description**: Returns all categories with their associated tags.
- **Response**:
  ```json
  [
    {
      "id": "uuid",
      "name_en": "Solar Policy",
      "name_cn": "太阳能政策",
      "name_my": "Dasar Tenaga Solar",
      "description_en": "News about solar energy policies and regulations",
      "description_cn": "关于太阳能政策和法规的新闻",
      "description_my": "Berita tentang dasar dan peraturan tenaga solar",
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z",
      "tags": [
        {
          "id": "uuid",
          "name": "policy",
          "category_id": "uuid"
        }
      ]
    }
  ]
  ```

### Create Category
**POST** `/categories`
- **Body**:
  ```json
  {
    "name_en": "Solar Policy",
    "name_cn": "太阳能政策",
    "name_my": "Dasar Tenaga Solar",
    "description_en": "News about solar energy policies and regulations",
    "description_cn": "关于太阳能政策和法规的新闻",
    "description_my": "Berita tentang dasar dan peraturan tenaga solar"
  }
  ```
- **Required Fields**: `name_en`, `name_cn`, `name_my`
- **Optional Fields**: `description_en`, `description_cn`, `description_my`
- **Response**: Created category object

### Update Category
**PUT** `/categories/:id`
- **Body** (all fields optional):
  ```json
  {
    "name_en": "Updated Solar Policy",
    "name_cn": "更新的太阳能政策",
    "name_my": "Dasar Tenaga Solar Dikemas Kini",
    "description_en": "Updated description...",
    "description_cn": "更新的描述...",
    "description_my": "Deskripsi dikemas kini..."
  }
  ```
- **Response**: Updated category object

### Delete Category
**DELETE** `/categories/:id`
- **Description**: Deletes a category. Will also delete all associated tags and news items.
- **Response**:
  ```json
  {
    "success": true
  }
  ```

### Create Tag under Category
**POST** `/categories/:id/tags`
- **Body**:
  ```json
  {
    "name": "policy"
  }
  ```
- **Description**: Creates a new tag under the specified category.
- **Response**:
  ```json
  {
    "id": "uuid",
    "name": "policy",
    "category_id": "uuid"
  }
  ```

### Delete Tag
**DELETE** `/tags/:id`
- **Description**: Deletes a specific tag.
- **Response**:
  ```json
  {
    "success": true
  }
  ```

---

## 5. Scheduler & Automation

### Run Pending Tasks (Cron Endpoint)
**POST** `/scheduler/run-pending-tasks`

- **Description**: Checks for overdue scheduled searches and triggers them. This endpoint is designed to be called by an external cron job (e.g., Railway Cron).
- **Recommended Cron Schedule**: Every 6 hours.
- **URL for Cron Job**: `https://atap-api-production.up.railway.app/api/v1/scheduler/run-pending-tasks`
- **Response (Success)**:
  ```json
  {
    "message": "Tasks executed",
    "results": [
      {
        "topic": "Solar Malaysia",
        "status": "triggered",
        "result": { "itemsFound": 5, "itemsProcessed": 2 }
      }
    ]
  }
  ```
- **Response (No Tasks)**:
  ```json
  {
    "message": "No tasks pending",
    "results": []
  }
  ```
