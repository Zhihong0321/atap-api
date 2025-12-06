-- AlterTable
ALTER TABLE "Category" DROP COLUMN "name",
ADD COLUMN     "name_en" TEXT NOT NULL,
ADD COLUMN     "name_cn" TEXT NOT NULL,
ADD COLUMN     "name_my" TEXT NOT NULL,
ADD COLUMN     "description_en" TEXT,
ADD COLUMN     "description_cn" TEXT,
ADD COLUMN     "description_my" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_en_key" ON "Category"("name_en");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_cn_key" ON "Category"("name_cn");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_my_key" ON "Category"("name_my");
