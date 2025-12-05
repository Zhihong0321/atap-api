import { z } from 'zod';

export const newsSourceSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().url().optional()
});

const baseNewsSchema = z.object({
  title_en: z.string().trim().min(3),
  title_cn: z.string().trim().min(1),
  title_my: z.string().trim().min(3),
  content_en: z.string().trim().min(10),
  content_cn: z.string().trim().min(10),
  content_my: z.string().trim().min(10),
  news_date: z.coerce.date(),
  sources: z.array(newsSourceSchema).optional().default([]),
  is_published: z.boolean().optional().default(false),
  is_highlight: z.boolean().optional().default(false)
});

export const createNewsSchema = baseNewsSchema;

export const updateNewsSchema = baseNewsSchema.partial().extend({
  news_date: z.coerce.date().optional()
});

export const publishSchema = z.object({
  is_published: z.boolean().optional(),
  is_highlight: z.boolean().optional()
});

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
