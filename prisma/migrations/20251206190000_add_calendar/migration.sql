-- CreateTable
CREATE TABLE "type_of_event" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_cn" TEXT NOT NULL,
    "name_my" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "type_of_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_item" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "type_of_event_id" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_cn" TEXT NOT NULL,
    "title_my" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendar_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "type_of_event_name_en_key" ON "type_of_event"("name_en");

-- CreateIndex
CREATE UNIQUE INDEX "type_of_event_name_cn_key" ON "type_of_event"("name_cn");

-- CreateIndex
CREATE UNIQUE INDEX "type_of_event_name_my_key" ON "type_of_event"("name_my");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_item_type_of_event_id_date_key" ON "calendar_item"("type_of_event_id", "date");

-- CreateIndex
CREATE INDEX "calendar_item_type_of_event_id_idx" ON "calendar_item"("type_of_event_id");

-- AddForeignKey
ALTER TABLE "calendar_item" ADD CONSTRAINT "calendar_item_type_of_event_id_fkey" FOREIGN KEY ("type_of_event_id") REFERENCES "type_of_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
