import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

const createTablesSQL = `
-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "NewsTaskStatus" AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "NewsLeadStatus" AS ENUM ('pending', 'rewrite_pending', 'rewritten', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable News
CREATE TABLE IF NOT EXISTS "News" (
    "id" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_cn" TEXT NOT NULL,
    "title_my" TEXT NOT NULL,
    "content_en" TEXT NOT NULL,
    "content_cn" TEXT NOT NULL,
    "content_my" TEXT NOT NULL,
    "news_date" TIMESTAMPTZ(6) NOT NULL,
    "image_url" TEXT,
    "sources" JSONB,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "is_highlight" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "category_id" TEXT,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable NewsTask
CREATE TABLE IF NOT EXISTS "NewsTask" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "account_name" TEXT,
    "collection_uuid" TEXT,
    "status" "NewsTaskStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "category_id" TEXT,

    CONSTRAINT "NewsTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable NewsLead
CREATE TABLE IF NOT EXISTS "NewsLead" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "source" JSONB,
    "published_at" TIMESTAMPTZ(6),
    "status" "NewsLeadStatus" NOT NULL DEFAULT 'pending',
    "news_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NewsLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable Category
CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable Tag
CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable _NewsTags (Many-to-Many)
CREATE TABLE IF NOT EXISTS "_NewsTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "NewsLead_news_id_key" ON "NewsLead"("news_id");
CREATE UNIQUE INDEX IF NOT EXISTS "NewsLead_task_id_headline_key" ON "NewsLead"("task_id", "headline");
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_category_id_name_key" ON "Tag"("category_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "_NewsTags_AB_unique" ON "_NewsTags"("A", "B");
CREATE INDEX IF NOT EXISTS "_NewsTags_B_index" ON "_NewsTags"("B");

-- AddForeignKeys
DO $$ BEGIN
    ALTER TABLE "News" ADD CONSTRAINT "News_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "NewsTask" ADD CONSTRAINT "NewsTask_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "NewsLead" ADD CONSTRAINT "NewsLead_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "NewsTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "NewsLead" ADD CONSTRAINT "NewsLead_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "News"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Tag" ADD CONSTRAINT "Tag_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "_NewsTags" ADD CONSTRAINT "_NewsTags_A_fkey" FOREIGN KEY ("A") REFERENCES "News"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "_NewsTags" ADD CONSTRAINT "_NewsTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
`;

export async function runSafeMigration() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Running safe migration...');
    await client.query(createTablesSQL);
    console.log('Migration completed successfully.');
    return { success: true, message: 'Tables created successfully' };
  } catch (error: any) {
    console.error('Migration failed:', error);
    return { success: false, error: error.message };
  } finally {
    await client.end();
  }
}
