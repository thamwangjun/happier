-- CreateTable
CREATE TABLE "UnackedMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionKey" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnackedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAckState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionKey" TEXT NOT NULL,
    "ackedSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAckState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnackedMessage_createdAt_idx" ON "UnackedMessage"("createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UnackedMessage_userId_connectionKey_seq_key" ON "UnackedMessage"("userId", "connectionKey", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAckState_userId_connectionKey_key" ON "ClientAckState"("userId", "connectionKey");
