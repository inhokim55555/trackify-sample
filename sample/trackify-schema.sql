-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'Scale',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'Editor',
    "disabledAt" TIMESTAMP(3),
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailEmail" TEXT,
    "scope" TEXT NOT NULL DEFAULT '',
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Editor',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "organisationId" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "firstTrackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "url" TEXT,
    "uploadDate" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoDailyMetric" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VideoDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCurrentMetric" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "VideoCurrentMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'custom',
    "parentId" TEXT,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "accountId" TEXT,
    "videoId" TEXT,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'Planning',
    "budget" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSubcategory" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trackerKind" TEXT NOT NULL DEFAULT 'seeding',
    "collectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Influencer" (
    "id" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "platform" TEXT,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipcode" TEXT,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInfluencer" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "trackerKind" TEXT NOT NULL DEFAULT 'seeding',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "rate" INTEGER NOT NULL DEFAULT 0,
    "finalLink" TEXT,
    "contactedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveryStatus" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "gmailThreads" JSONB NOT NULL DEFAULT '[]',
    "trackerFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignInfluencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStatus" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricRefreshRun" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "videosChecked" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "metricsSynced" INTEGER NOT NULL DEFAULT 0,
    "failureSummary" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricRefreshRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricRefreshLease" (
    "organisationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricRefreshLease_pkey" PRIMARY KEY ("organisationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");

-- CreateIndex
CREATE INDEX "GmailConnection_userId_idx" ON "GmailConnection"("userId");

-- CreateIndex
CREATE INDEX "TeamInvite_organisationId_idx" ON "TeamInvite"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_organisationId_email_key" ON "TeamInvite"("organisationId", "email");

-- CreateIndex
CREATE INDEX "Account_organisationId_idx" ON "Account"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_organisationId_platform_handle_key" ON "Account"("organisationId", "platform", "handle");

-- CreateIndex
CREATE INDEX "Video_organisationId_idx" ON "Video"("organisationId");

-- CreateIndex
CREATE INDEX "Video_organisationId_platform_idx" ON "Video"("organisationId", "platform");

-- CreateIndex
CREATE INDEX "Video_organisationId_uploadDate_idx" ON "Video"("organisationId", "uploadDate");

-- CreateIndex
CREATE INDEX "Video_accountId_idx" ON "Video"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Video_organisationId_url_key" ON "Video"("organisationId", "url");

-- CreateIndex
CREATE INDEX "VideoDailyMetric_videoId_idx" ON "VideoDailyMetric"("videoId");

-- CreateIndex
CREATE INDEX "VideoDailyMetric_date_idx" ON "VideoDailyMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "VideoDailyMetric_videoId_date_key" ON "VideoDailyMetric"("videoId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCurrentMetric_videoId_key" ON "VideoCurrentMetric"("videoId");

-- CreateIndex
CREATE INDEX "VideoCurrentMetric_capturedAt_idx" ON "VideoCurrentMetric"("capturedAt");

-- CreateIndex
CREATE INDEX "VideoCurrentMetric_views_idx" ON "VideoCurrentMetric"("views");

-- CreateIndex
CREATE INDEX "Collection_organisationId_idx" ON "Collection"("organisationId");

-- CreateIndex
CREATE INDEX "Collection_parentId_idx" ON "Collection"("parentId");

-- CreateIndex
CREATE INDEX "CollectionItem_collectionId_idx" ON "CollectionItem"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionItem_accountId_idx" ON "CollectionItem"("accountId");

-- CreateIndex
CREATE INDEX "CollectionItem_videoId_idx" ON "CollectionItem"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_accountId_key" ON "CollectionItem"("collectionId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_videoId_key" ON "CollectionItem"("collectionId", "videoId");

-- CreateIndex
CREATE INDEX "Campaign_organisationId_idx" ON "Campaign"("organisationId");

-- CreateIndex
CREATE INDEX "CampaignSubcategory_campaignId_idx" ON "CampaignSubcategory"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignSubcategory_collectionId_idx" ON "CampaignSubcategory"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSubcategory_campaignId_name_key" ON "CampaignSubcategory"("campaignId", "name");

-- CreateIndex
CREATE INDEX "Influencer_organisationId_idx" ON "Influencer"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_organisationId_profile_key" ON "Influencer"("organisationId", "profile");

-- CreateIndex
CREATE INDEX "CampaignInfluencer_campaignId_idx" ON "CampaignInfluencer"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignInfluencer_influencerId_idx" ON "CampaignInfluencer"("influencerId");

-- CreateIndex
CREATE INDEX "CampaignInfluencer_subcategoryId_idx" ON "CampaignInfluencer"("subcategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInfluencer_campaignId_influencerId_subcategoryId_key" ON "CampaignInfluencer"("campaignId", "influencerId", "subcategoryId");

-- CreateIndex
CREATE INDEX "WorkflowStatus_campaignId_idx" ON "WorkflowStatus"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStatus_campaignId_label_key" ON "WorkflowStatus"("campaignId", "label");

-- CreateIndex
CREATE INDEX "MetricRefreshRun_organisationId_idx" ON "MetricRefreshRun"("organisationId");

-- CreateIndex
CREATE INDEX "MetricRefreshRun_startedAt_idx" ON "MetricRefreshRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetricRefreshLease_runId_key" ON "MetricRefreshLease"("runId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoDailyMetric" ADD CONSTRAINT "VideoDailyMetric_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCurrentMetric" ADD CONSTRAINT "VideoCurrentMetric_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSubcategory" ADD CONSTRAINT "CampaignSubcategory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSubcategory" ADD CONSTRAINT "CampaignSubcategory_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Influencer" ADD CONSTRAINT "Influencer_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInfluencer" ADD CONSTRAINT "CampaignInfluencer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInfluencer" ADD CONSTRAINT "CampaignInfluencer_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInfluencer" ADD CONSTRAINT "CampaignInfluencer_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "CampaignSubcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStatus" ADD CONSTRAINT "WorkflowStatus_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricRefreshRun" ADD CONSTRAINT "MetricRefreshRun_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricRefreshLease" ADD CONSTRAINT "MetricRefreshLease_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricRefreshLease" ADD CONSTRAINT "MetricRefreshLease_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MetricRefreshRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
