-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_cn" TEXT NOT NULL,
    "title_my" TEXT NOT NULL,
    "content_en" TEXT NOT NULL,
    "content_cn" TEXT NOT NULL,
    "content_my" TEXT NOT NULL,
    "news_date" TIMESTAMPTZ(6) NOT NULL,
    "sources" JSONB,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "is_highlight" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

