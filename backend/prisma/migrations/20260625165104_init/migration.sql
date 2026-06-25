-- CreateEnum
CREATE TYPE "mode" AS ENUM ('basic', 'advanced');

-- CreateEnum
CREATE TYPE "clue_type" AS ENUM ('text', 'image');

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('apple', 'google', 'anon');

-- CreateEnum
CREATE TYPE "level_status" AS ENUM ('active', 'retired');

-- CreateTable
CREATE TABLE "languages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supported_scripts" TEXT[],

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary" (
    "id" TEXT NOT NULL,
    "language_id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "frequency" DOUBLE PRECISION NOT NULL,
    "length" INTEGER NOT NULL,

    CONSTRAINT "dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clues" (
    "id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "type" "clue_type" NOT NULL,
    "content" TEXT NOT NULL,
    "personality_id" TEXT,

    CONSTRAINT "clues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personalities" (
    "id" TEXT NOT NULL,
    "language_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "answer_word_id" TEXT NOT NULL,

    CONSTRAINT "personalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" TEXT NOT NULL,
    "mode" "mode" NOT NULL,
    "language_id" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "difficulty_coefficient" INTEGER NOT NULL,
    "difficulty_band" INTEGER NOT NULL,
    "level_number" INTEGER NOT NULL,
    "variation_group" INTEGER NOT NULL,
    "grid_width" INTEGER NOT NULL,
    "grid_height" INTEGER NOT NULL,
    "grid_data" JSONB NOT NULL,
    "status" "level_status" NOT NULL DEFAULT 'active',

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "auth_provider" "auth_provider" NOT NULL,
    "external_id" TEXT,
    "current_language_id" TEXT,
    "current_script" TEXT,
    "theme" TEXT,
    "check_mode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "mode" "mode" NOT NULL,
    "stars" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "mistakes" INTEGER NOT NULL,
    "hints_used" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE INDEX "dictionary_language_id_script_length_idx" ON "dictionary"("language_id", "script", "length");

-- CreateIndex
CREATE INDEX "clues_word_id_idx" ON "clues"("word_id");

-- CreateIndex
CREATE INDEX "clues_personality_id_idx" ON "clues"("personality_id");

-- CreateIndex
CREATE INDEX "personalities_language_id_idx" ON "personalities"("language_id");

-- CreateIndex
CREATE INDEX "personalities_answer_word_id_idx" ON "personalities"("answer_word_id");

-- CreateIndex
CREATE INDEX "levels_language_id_script_mode_level_number_status_idx" ON "levels"("language_id", "script", "mode", "level_number", "status");

-- CreateIndex
CREATE INDEX "user_progress_level_id_idx" ON "user_progress"("level_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_user_id_level_id_mode_key" ON "user_progress"("user_id", "level_id", "mode");

-- AddForeignKey
ALTER TABLE "dictionary" ADD CONSTRAINT "dictionary_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clues" ADD CONSTRAINT "clues_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clues" ADD CONSTRAINT "clues_personality_id_fkey" FOREIGN KEY ("personality_id") REFERENCES "personalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalities" ADD CONSTRAINT "personalities_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalities" ADD CONSTRAINT "personalities_answer_word_id_fkey" FOREIGN KEY ("answer_word_id") REFERENCES "dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
