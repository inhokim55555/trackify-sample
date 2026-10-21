export type CampaignStage = "Planning" | "Outreach" | "Live" | "Complete";
export type CampaignTrackerKind = "seeding" | "paid";
export type CampaignSegment = "all" | CampaignTrackerKind | `custom:${string}`;

export interface CampaignSubcategory {
  id: string;
  name: string;
  trackerKind: CampaignTrackerKind;
  collectionId?: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  brand: string;
  objective: string;
  owner: string;
  startsAt: string;
  endsAt: string;
  budget: number;
  stage: CampaignStage;
  notes: string;
  segmentCollections?: Partial<Record<CampaignTrackerKind, string | null>>;
  subcategories: CampaignSubcategory[];
}

export const CAMPAIGN_STAGES: CampaignStage[] = [
  "Planning",
  "Outreach",
  "Live",
  "Complete",
];

export const SAMPLE_CAMPAIGNS: Campaign[] = [
  {
    "id": "sample-campaign-0",
    "name": "Lumen Grove · Daily Cream",
    "brand": "Lumen Grove",
    "objective": "Fictional portfolio scenario",
    "owner": "Alex Rivera",
    "startsAt": "2026-09-16",
    "endsAt": "2026-11-11",
    "budget": 6000,
    "stage": "Live",
    "notes": "Fictional sample. No external activity is scheduled.",
    "subcategories": []
  },
  {
    "id": "sample-campaign-1",
    "name": "Tidewell · Scalp Wash",
    "brand": "Tidewell",
    "objective": "Fictional portfolio scenario",
    "owner": "Alex Rivera",
    "startsAt": "2026-09-16",
    "endsAt": "2026-11-11",
    "budget": 7500,
    "stage": "Live",
    "notes": "Fictional sample. No external activity is scheduled.",
    "subcategories": []
  },
  {
    "id": "sample-campaign-2",
    "name": "Fieldnote · Sun Veil",
    "brand": "Fieldnote",
    "objective": "Fictional portfolio scenario",
    "owner": "Alex Rivera",
    "startsAt": "2026-09-16",
    "endsAt": "2026-11-11",
    "budget": 9000,
    "stage": "Live",
    "notes": "Fictional sample. No external activity is scheduled.",
    "subcategories": []
  }
];

export const DEFAULT_WORKFLOW_STATUSES = [
  { id: "open", label: "Open", color: "gray" },
  { id: "in-negotiation", label: "In Negotiation", color: "amber" },
  { id: "needs-reply", label: "Needs Reply", color: "rose" },
  { id: "waiting-on-creator", label: "Waiting on Creator", color: "sky" },
  { id: "content-due", label: "Content Due", color: "violet" },
  { id: "posted", label: "Posted", color: "emerald" },
  { id: "do-not-book", label: "Do Not Book", color: "rose" },
] as const;

export type StarterPlatform =
  | "TikTok"
  | "Instagram"
  | "YouTube"
  | "Facebook"
  | "Snapchat"
  | "X";

export type StarterRateType = "Flat" | "Gifted" | "Affiliate";

export interface StarterInfluencer {
  id: string;
  creatorName: string;
  handle: string;
  platform: StarterPlatform;
  category: string;
  followerCount: number;
  engagementRate: number;
  negotiatedRate: number;
  rateType: StarterRateType;
  lastContacted: string;
  lastUpdated: string;
  status: string;
  notes: string;
  nextFollowUp?: string;
  deliverableDue?: string;
  priority?: string;
  statusHistory?: string[];
  campaignIds: string[];
  gmailThreads: [];
}

export const STARTER_INFLUENCERS: StarterInfluencer[] = [
  {
    "id": "sample-starter-0",
    "creatorName": "Maya Linden",
    "handle": "@portfolio_sample_01",
    "platform": "TikTok",
    "category": "Skincare",
    "followerCount": 12000,
    "engagementRate": 3.2,
    "negotiatedRate": 500,
    "rateType": "Flat",
    "lastContacted": "2026-10-10",
    "lastUpdated": "2026-10-20",
    "status": "Open",
    "notes": "Fictional sample, not a live creator record.",
    "campaignIds": [
      "sample-campaign-0"
    ],
    "gmailThreads": []
  },
  {
    "id": "sample-starter-1",
    "creatorName": "Theo Vale",
    "handle": "@portfolio_sample_02",
    "platform": "Instagram",
    "category": "Skincare",
    "followerCount": 16700,
    "engagementRate": 3.4000000000000004,
    "negotiatedRate": 550,
    "rateType": "Flat",
    "lastContacted": "2026-10-10",
    "lastUpdated": "2026-10-20",
    "status": "Open",
    "notes": "Fictional sample, not a live creator record.",
    "campaignIds": [
      "sample-campaign-1"
    ],
    "gmailThreads": []
  },
  {
    "id": "sample-starter-2",
    "creatorName": "Nora Finch",
    "handle": "@portfolio_sample_03",
    "platform": "YouTube",
    "category": "Skincare",
    "followerCount": 21400,
    "engagementRate": 3.6,
    "negotiatedRate": 600,
    "rateType": "Flat",
    "lastContacted": "2026-10-10",
    "lastUpdated": "2026-10-20",
    "status": "Open",
    "notes": "Fictional sample, not a live creator record.",
    "campaignIds": [
      "sample-campaign-2"
    ],
    "gmailThreads": []
  },
  {
    "id": "sample-starter-3",
    "creatorName": "Jules Rowan",
    "handle": "@portfolio_sample_04",
    "platform": "TikTok",
    "category": "Skincare",
    "followerCount": 26100,
    "engagementRate": 3.8000000000000003,
    "negotiatedRate": 650,
    "rateType": "Flat",
    "lastContacted": "2026-10-10",
    "lastUpdated": "2026-10-20",
    "status": "Open",
    "notes": "Fictional sample, not a live creator record.",
    "campaignIds": [
      "sample-campaign-0"
    ],
    "gmailThreads": []
  },
  {
    "id": "sample-starter-4",
    "creatorName": "Ari Meadow",
    "handle": "@portfolio_sample_05",
    "platform": "Instagram",
    "category": "Skincare",
    "followerCount": 30800,
    "engagementRate": 4,
    "negotiatedRate": 700,
    "rateType": "Flat",
    "lastContacted": "2026-10-10",
    "lastUpdated": "2026-10-20",
    "status": "Open",
    "notes": "Fictional sample, not a live creator record.",
    "campaignIds": [
      "sample-campaign-1"
    ],
    "gmailThreads": []
  },
  {
    "id": "sample-starter-5",
    "creatorName": "Clara Wren",
    "handle": "@portfolio_sample_06",
    "platform": "YouTube",
    "category": "Skincare",
    "followerCount": 35500,
    "engagementRate": 4.2,
    "negotiatedRate": 750,
    "rateType": "Flat",
    "lastContacted": "2026-10-10",
    "lastUpdated": "2026-10-20",
    "status": "Open",
    "notes": "Fictional sample, not a live creator record.",
    "campaignIds": [
      "sample-campaign-2"
    ],
    "gmailThreads": []
  }
];
