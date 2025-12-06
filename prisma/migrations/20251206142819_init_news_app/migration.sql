-- CreateEnum
CREATE TYPE "NewsTaskStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "NewsLeadStatus" AS ENUM ('pending', 'rewrite_pending', 'rewritten', 'error');

-- AlterTable
ALTER TABLE "News" ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "image_url" TEXT;

-- CreateTable
CREATE TABLE "NewsTask" (
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

-- CreateTable
CREATE TABLE "NewsLead" (
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

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_cn" TEXT NOT NULL,
    "name_my" TEXT NOT NULL,
    "description_en" TEXT,
    "description_cn" TEXT,
    "description_my" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_NewsTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsLead_news_id_key" ON "NewsLead"("news_id");

-- CreateIndex
CREATE UNIQUE INDEX "NewsLead_task_id_headline_key" ON "NewsLead"("task_id", "headline");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_en_key" ON "Category"("name_en");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_cn_key" ON "Category"("name_cn");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_my_key" ON "Category"("name_my");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_category_id_name_key" ON "Tag"("category_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "_NewsTags_AB_unique" ON "_NewsTags"("A", "B");

-- CreateIndex
CREATE INDEX "_NewsTags_B_index" ON "_NewsTags"("B");

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsTask" ADD CONSTRAINT "NewsTask_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsLead" ADD CONSTRAINT "NewsLead_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "NewsTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsLead" ADD CONSTRAINT "NewsLead_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "News"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NewsTags" ADD CONSTRAINT "_NewsTags_A_fkey" FOREIGN KEY ("A") REFERENCES "News"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NewsTags" ADD CONSTRAINT "_NewsTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
