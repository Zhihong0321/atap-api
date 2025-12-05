# Perplexity Rewriter Payload Schema

When querying the **News Rewriter** collection with a headline, the API returns a JSON object with the following structure:

```json
{
  "meta": {
    "headline_query": "Original Headline String",
    "date_query": "YYYY-MM-DD",
    "generated_utc": "ISO-8601 Timestamp",
    "image_url": "URL to a relevant image (can be used for cover image)"
  },
  "data": {
    "en": {
      "context_warming": "Brief intro paragraph...",
      "main_points": [ "Point 1", "Point 2", ... ],
      "analysis": {
        "impact_summary": "...",
        "affected_stakeholders": [ "Benefits: ...", "Challenges: ..." ],
        "future_outlook": "..."
      },
      "background_context": "..."
    },
    "zh_cn": {
      // Same structure as 'en' but in Chinese
    },
    "ms_my": {
      // Same structure as 'en' but in Malay
    }
  },
  "source_urls": [
    "https://source1.com",
    "https://source2.com",
    ...
  ]
}
```

## Integration Strategy
1. **Trigger**: When a `NewsLead` status is `pending_rewrite`.
2. **Input**: `NewsLead.headline` passed as query `q`.
3. **Output Handling**:
   - **Title**: Use `meta.headline_query` (or keep original).
   - **Image**: Save `meta.image_url` to `News.image_url` (Need to add this field to DB?).
   - **Content (EN/CN/MY)**: 
     - Concatenate `context_warming` + `main_points` + `analysis` + `background_context` into a structured HTML or Markdown string for `News.content_en`, `News.content_cn`, `News.content_my`.
   - **Sources**: Store `source_urls` in `News.sources` JSON field.
