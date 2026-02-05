import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { formatMonthLabel } from "@/lib/format";

// ----------------------------
// Types
// ----------------------------

export type Platform = "x" | "linkedin";

export type DailyMetric = {
  source: Platform;
  date: Date;
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  clicks: number;
  shares: number;
  bookmarks: number;
  profileVisits: number;
  engagements: number;
  videoViews: number;
  videoWatchViews: number;
  videoWatchTimeMs: number;
  videoCompletionRateSum: number;
  posts: number;
  newFollows: number;
  unfollows: number;
};

export type MonthSummary = {
  monthKey: string; // YYYY-MM
  label: string; // e.g., Jan 2026
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  clicks: number;
  shares: number;
  bookmarks: number;
  profileVisits: number;
  engagements: number;
  videoViews: number;
  videoWatchViews: number;
  videoWatchTimeMs: number;
  videoCompletionRateSum: number;
  posts: number;
  newFollows: number;
  unfollows: number;
  days: number;
};

export type Coverage = {
  start: Date | null;
  end: Date | null;
  days: number;
};

export type DashboardData = {
  x: PlatformData;
  linkedin: PlatformData;
  combined: PlatformData;
  engagementMix: { label: string; value: number }[];
  mom: Record<string, number | null>;
  lastMonthLabel: string;
  previousMonthLabel: string;
  xTopPosts: XPostSummary[];
  linkedinTopPosts: LinkedInPostSummary[];
  linkedinTopPostsByRate: LinkedInPostSummary[];
  linkedinContentTypes: LinkedInContentTypeSummary[];
  dayOfWeek: DayOfWeekSummary[];
  bestTimes: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  dataQuality: DataQualitySummary[];
  csvValidation: CsvValidation[];
  usingSampleData: boolean;
};

export type PlatformData = {
  daily: DailyMetric[];
  monthly: MonthSummary[];
  totals: MonthSummary;
  coverage: Coverage;
};

export type LinkedInPostSummary = {
  title: string;
  link: string;
  createdAt: Date;
  impressions: number;
  views: number;
  clicks: number;
  likes: number;
  comments: number;
  reposts: number;
  engagementRate: number | null;
  contentType: string;
};

export type XPostSummary = {
  text: string;
  link: string;
  createdAt: Date | null;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  engagements: number;
  engagementRate: number | null;
};

export type LinkedInContentTypeSummary = {
  type: string;
  posts: number;
  impressions: number;
  views: number;
  engagements: number;
};

export type DayOfWeekSummary = {
  day: string;
  averageViews: number;
  totalViews: number;
  days: number;
};

export type BestTimeSlot = {
  label: string;
  day: string;
  hour: number | null;
  posts: number;
  impressions: number;
  engagements: number;
  engagementRate: number | null;
};

export type CsvValidation = {
  id: string;
  label: string;
  filePath: string;
  source: "raw" | "sample" | "missing";
  rowCount: number;
  missingRequired: string[];
  missingOptional: string[];
};

export type DataQualitySummary = {
  label: string;
  coverage: Coverage;
  expectedDays: number | null;
  missingDays: number | null;
  zeroViewDays: number;
};

// ----------------------------
// File locations (v1: local CSV files)
// ----------------------------

const DATA_DIR_RAW = path.join(process.cwd(), "Data", "raw");
const DATA_DIR_SAMPLE = path.join(process.cwd(), "Data", "sample");

const X_CSV = process.env.X_CSV_PATH ?? "x_account_analytics.csv";
const X_CSV_SAMPLE = "x_account_analytics_sample.csv";
const X_POSTS_CSV = process.env.X_POSTS_CSV_PATH ?? "x_post_analytics.csv";
const X_POSTS_CSV_SAMPLE = "x_post_analytics_sample.csv";
const X_VIDEO_OVERVIEW_CSV =
  process.env.X_VIDEO_OVERVIEW_CSV_PATH ?? "x_video_overview.csv";
const X_VIDEO_OVERVIEW_CSV_SAMPLE = "x_video_overview_sample.csv";
const LINKEDIN_CSV = process.env.LINKEDIN_CSV_PATH ?? "linkedin_metrics.csv";
const LINKEDIN_CSV_SAMPLE = "linkedin_metrics_sample.csv";
const LINKEDIN_POSTS_CSV =
  process.env.LINKEDIN_POSTS_CSV_PATH ?? "linkedin_posts.csv";
const LINKEDIN_POSTS_CSV_SAMPLE = "linkedin_posts_sample.csv";

// LinkedIn export uses MM/DD/YYYY in most locales. Change to "DMY" if needed.
const LINKEDIN_DATE_FORMAT: "MDY" | "DMY" = "MDY";

// ----------------------------
// Public API: used by the page
// ----------------------------

export async function getDashboardData(): Promise<DashboardData> {
  const linkedInPostsData = await loadLinkedInPostsData();
  const xPostsData = await loadXPostsData();
  const [xDailyResult, linkedInDailyResult] = await Promise.all([
    loadXDailyMetrics(),
    loadLinkedInDailyMetrics(linkedInPostsData.postsByDate)
  ]);

  const xData = buildPlatformData(xDailyResult.metrics);
  const linkedinData = buildPlatformData(linkedInDailyResult.metrics);
  const combinedData = buildPlatformData([
    ...xDailyResult.metrics,
    ...linkedInDailyResult.metrics
  ]);

  const engagementMix = buildEngagementMix(combinedData.totals);
  const { mom, lastMonthLabel, previousMonthLabel } = calculateMomGrowth(
    combinedData.monthly
  );
  const dayOfWeek = buildDayOfWeekSummary(combinedData.daily);
  const dataQuality = [
    buildDataQuality("X", xDailyResult.metrics),
    buildDataQuality("LinkedIn", linkedInDailyResult.metrics),
    buildDataQuality("Combined", combinedData.daily)
  ];

  const csvValidation = [
    xDailyResult.validation,
    xDailyResult.videoValidation,
    xPostsData.validation,
    linkedInDailyResult.validation,
    linkedInPostsData.validation
  ];
  const usingSampleData = csvValidation.some((item) => item.source === "sample");

  return {
    x: xData,
    linkedin: linkedinData,
    combined: combinedData,
    engagementMix,
    mom,
    lastMonthLabel,
    previousMonthLabel,
    xTopPosts: xPostsData.topPosts,
    linkedinTopPosts: linkedInPostsData.topPosts,
    linkedinTopPostsByRate: linkedInPostsData.topPostsByRate,
    linkedinContentTypes: linkedInPostsData.contentTypes,
    dayOfWeek,
    bestTimes: linkedInPostsData.bestTimes,
    timeOfDayAvailable: linkedInPostsData.timeOfDayAvailable,
    dataQuality,
    csvValidation,
    usingSampleData
  };
}

// ----------------------------
// Loading + parsing helpers
// ----------------------------

type ColumnGroup = { label: string; fields: string[] };

// Prefer raw user exports, but fall back to sample files so the UI never crashes.
async function readCsvWithFallback(
  rawFile: string,
  sampleFile: string
): Promise<{ text: string | null; filePath: string; source: "raw" | "sample" | "missing" }> {
  const rawPath = resolveDataPath(rawFile, DATA_DIR_RAW);
  if (existsSync(rawPath)) {
    return {
      text: await fs.readFile(rawPath, "utf-8"),
      filePath: rawPath,
      source: "raw"
    };
  }

  const samplePath = resolveDataPath(sampleFile, DATA_DIR_SAMPLE);
  if (existsSync(samplePath)) {
    return {
      text: await fs.readFile(samplePath, "utf-8"),
      filePath: samplePath,
      source: "sample"
    };
  }

  return {
    text: null,
    filePath: rawPath,
    source: "missing"
  };
}

// Summarize which required and optional columns are missing for the UI.
function buildCsvValidation(args: {
  id: string;
  label: string;
  filePath: string;
  source: "raw" | "sample" | "missing";
  rowCount: number;
  headers: string[];
  requiredGroups: ColumnGroup[];
  optionalGroups: ColumnGroup[];
}): CsvValidation {
  const headersLower = new Set(args.headers.map((header) => header.toLowerCase()));
  const missingRequired = findMissingGroups(headersLower, args.requiredGroups);
  const missingOptional = findMissingGroups(headersLower, args.optionalGroups);

  return {
    id: args.id,
    label: args.label,
    filePath: args.filePath ? path.relative(process.cwd(), args.filePath) : "n/a",
    source: args.source,
    rowCount: args.rowCount,
    missingRequired,
    missingOptional
  };
}

function findMissingGroups(
  headersLower: Set<string>,
  groups: ColumnGroup[]
): string[] {
  return groups
    .filter((group) =>
      group.fields.every((field) => !headersLower.has(field.toLowerCase()))
    )
    .map((group) => group.label);
}

async function loadXDailyMetrics(): Promise<{
  metrics: DailyMetric[];
  validation: CsvValidation;
  videoValidation: CsvValidation;
}> {
  const { videoMap, validation: videoValidation } = await loadXVideoOverviewByDate();
  const source = await readCsvWithFallback(X_CSV, X_CSV_SAMPLE);
  const parsed = source.text ? parseCsvWithHeader(source.text, "Date") : null;
  const headers = parsed?.headers ?? [];
  const rows = parsed?.rows ?? [];

  const validation = buildCsvValidation({
    id: "x-daily",
    label: "X account analytics",
    filePath: source.filePath,
    source: source.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Date", fields: ["Date"] },
      { label: "Impressions", fields: ["Impressions"] }
    ],
    optionalGroups: [
      { label: "Likes", fields: ["Likes"] },
      { label: "Replies", fields: ["Replies"] },
      { label: "Reposts", fields: ["Reposts", "Retweets"] },
      { label: "Shares", fields: ["Shares"] },
      { label: "Bookmarks", fields: ["Bookmarks"] },
      { label: "Profile visits", fields: ["Profile visits"] },
      { label: "Engagements", fields: ["Engagements"] },
      { label: "Video views", fields: ["Video views"] },
      { label: "Create Post", fields: ["Create Post"] },
      { label: "New follows", fields: ["New follows"] },
      { label: "Unfollows", fields: ["Unfollows"] }
    ]
  });

  const metrics = rows
    .map((row) => {
      const date = parseXDate(String(pickField(row, ["Date"])));
      if (!date) return null;

      const video = videoMap.get(toDayKey(date));
      const videoWatchViews = video?.views ?? 0;
      const videoWatchTimeMs = video?.watchTimeMs ?? 0;
      const videoCompletionRateSum = video
        ? video.completionRate * video.views
        : 0;
      const baseVideoViews = toNumber(pickField(row, ["Video views"]));

      return {
        source: "x" as const,
        date,
        views: toNumber(pickField(row, ["Impressions"])),
        likes: toNumber(pickField(row, ["Likes"])),
        comments: toNumber(pickField(row, ["Replies"])),
        reposts:
          toNumber(pickField(row, ["Reposts", "Retweets"])) +
          toNumber(pickField(row, ["Shares"])),
        clicks: 0,
        shares: toNumber(pickField(row, ["Shares"])),
        bookmarks: toNumber(pickField(row, ["Bookmarks"])),
        profileVisits: toNumber(pickField(row, ["Profile visits"])),
        engagements: toNumber(pickField(row, ["Engagements"])),
        videoViews: baseVideoViews || videoWatchViews,
        videoWatchViews,
        videoWatchTimeMs,
        videoCompletionRateSum,
        posts: toNumber(pickField(row, ["Create Post"])),
        newFollows: toNumber(pickField(row, ["New follows"])),
        unfollows: toNumber(pickField(row, ["Unfollows"]))
      };
    })
    .filter(Boolean) as DailyMetric[];

  return { metrics, validation, videoValidation };
}

async function loadLinkedInDailyMetrics(
  postsByDate: Map<string, number>
): Promise<{ metrics: DailyMetric[]; validation: CsvValidation }> {
  const source = await readCsvWithFallback(LINKEDIN_CSV, LINKEDIN_CSV_SAMPLE);
  const parsed = source.text ? parseLinkedInCsvRows(source.text, "Date") : null;
  const headers = parsed?.headers ?? [];
  const rows = parsed?.rows ?? [];

  const validation = buildCsvValidation({
    id: "linkedin-daily",
    label: "LinkedIn daily metrics",
    filePath: source.filePath,
    source: source.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Date", fields: ["Date"] },
      {
        label: "Impressions",
        fields: ["Impressions (total)", "Impressions", "Impressions (organic)"]
      }
    ],
    optionalGroups: [
      { label: "Clicks", fields: ["Clicks (total)", "Clicks", "Clicks (organic)"] },
      {
        label: "Reactions",
        fields: ["Reactions (total)", "Reactions", "Reactions (organic)"]
      },
      {
        label: "Comments",
        fields: ["Comments (total)", "Comments", "Comments (organic)"]
      },
      {
        label: "Reposts",
        fields: ["Reposts (total)", "Reposts", "Reposts (organic)", "Shares"]
      }
    ]
  });

  const metrics = rows
    .map((row) => {
      const dateValue = pickField(row, ["Date"]);
      const date = parseLinkedInDate(dateValue);
      if (!date) return null;

      return {
        source: "linkedin" as const,
        date,
        views: toNumber(
          pickField(row, [
            "Impressions (total)",
            "Impressions",
            "Impressions (organic)"
          ])
        ),
        clicks: toNumber(
          pickField(row, [
            "Clicks (total)",
            "Clicks",
            "Clicks (organic)"
          ])
        ),
        shares: 0,
        bookmarks: 0,
        profileVisits: 0,
        likes: toNumber(
          pickField(row, [
            "Reactions (total)",
            "Reactions",
            "Reactions (organic)"
          ])
        ),
        comments: toNumber(
          pickField(row, [
            "Comments (total)",
            "Comments",
            "Comments (organic)"
          ])
        ),
        reposts: toNumber(
          pickField(row, [
            "Reposts (total)",
            "Reposts",
            "Reposts (organic)",
            "Shares"
          ])
        ),
        engagements: 0,
        videoViews: 0,
        videoWatchViews: 0,
        videoWatchTimeMs: 0,
        videoCompletionRateSum: 0,
        posts: postsByDate.get(toDayKey(date)) ?? 0,
        newFollows: 0,
        unfollows: 0
      };
    })
    .filter(Boolean) as DailyMetric[];

  return { metrics, validation };
}

// ----------------------------
// Aggregation helpers
// ----------------------------

function buildPlatformData(daily: DailyMetric[]): PlatformData {
  const monthly = aggregateByMonth(daily);
  const totals = summarizeTotals(monthly);
  const coverage = buildCoverage(daily);

  return { daily, monthly, totals, coverage };
}

function aggregateByMonth(daily: DailyMetric[]): MonthSummary[] {
  const buckets = new Map<string, MonthSummary>();

  daily.forEach((metric) => {
    const monthKey = toMonthKey(metric.date);
    const existing = buckets.get(monthKey);

    if (!existing) {
      buckets.set(monthKey, {
        monthKey,
        label: formatMonthLabel(monthKey),
        views: metric.views,
        likes: metric.likes,
        comments: metric.comments,
        reposts: metric.reposts,
        clicks: metric.clicks,
        shares: metric.shares,
        bookmarks: metric.bookmarks,
        profileVisits: metric.profileVisits,
        engagements: metric.engagements,
        videoViews: metric.videoViews,
        videoWatchViews: metric.videoWatchViews,
        videoWatchTimeMs: metric.videoWatchTimeMs,
        videoCompletionRateSum: metric.videoCompletionRateSum,
        posts: metric.posts,
        newFollows: metric.newFollows,
        unfollows: metric.unfollows,
        days: 1
      });
      return;
    }

    existing.views += metric.views;
    existing.likes += metric.likes;
    existing.comments += metric.comments;
    existing.reposts += metric.reposts;
    existing.clicks += metric.clicks;
    existing.shares += metric.shares;
    existing.bookmarks += metric.bookmarks;
    existing.profileVisits += metric.profileVisits;
    existing.engagements += metric.engagements;
    existing.videoViews += metric.videoViews;
    existing.videoWatchViews += metric.videoWatchViews;
    existing.videoWatchTimeMs += metric.videoWatchTimeMs;
    existing.videoCompletionRateSum += metric.videoCompletionRateSum;
    existing.posts += metric.posts;
    existing.newFollows += metric.newFollows;
    existing.unfollows += metric.unfollows;
    existing.days += 1;
  });

  return Array.from(buckets.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
}

function summarizeTotals(monthly: MonthSummary[]): MonthSummary {
  return monthly.reduce(
    (acc, month) => {
      acc.views += month.views;
      acc.likes += month.likes;
      acc.comments += month.comments;
      acc.reposts += month.reposts;
      acc.clicks += month.clicks;
      acc.shares += month.shares;
      acc.bookmarks += month.bookmarks;
      acc.profileVisits += month.profileVisits;
      acc.engagements += month.engagements;
      acc.videoViews += month.videoViews;
      acc.videoWatchViews += month.videoWatchViews;
      acc.videoWatchTimeMs += month.videoWatchTimeMs;
      acc.videoCompletionRateSum += month.videoCompletionRateSum;
      acc.posts += month.posts;
      acc.newFollows += month.newFollows;
      acc.unfollows += month.unfollows;
      acc.days += month.days;
      return acc;
    },
    {
      monthKey: "total",
      label: "Total",
      views: 0,
      likes: 0,
      comments: 0,
      reposts: 0,
      clicks: 0,
      shares: 0,
      bookmarks: 0,
      profileVisits: 0,
      engagements: 0,
      videoViews: 0,
      videoWatchViews: 0,
      videoWatchTimeMs: 0,
      videoCompletionRateSum: 0,
      posts: 0,
      newFollows: 0,
      unfollows: 0,
      days: 0
    }
  );
}

function buildCoverage(daily: DailyMetric[]): Coverage {
  if (daily.length === 0) {
    return { start: null, end: null, days: 0 };
  }

  const sorted = [...daily].sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    start: sorted[0].date,
    end: sorted[sorted.length - 1].date,
    days: sorted.length
  };
}

// Coverage + gaps help spot missing days or empty exports quickly.
function buildDataQuality(label: string, daily: DailyMetric[]): DataQualitySummary {
  const coverage = buildCoverage(daily);
  if (!coverage.start || !coverage.end) {
    return {
      label,
      coverage,
      expectedDays: null,
      missingDays: null,
      zeroViewDays: 0
    };
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const expectedDays =
    Math.round((coverage.end.getTime() - coverage.start.getTime()) / dayMs) + 1;
  const missingDays = Math.max(expectedDays - coverage.days, 0);
  const zeroViewDays = daily.filter((metric) => metric.views === 0).length;

  return {
    label,
    coverage,
    expectedDays,
    missingDays,
    zeroViewDays
  };
}

function buildEngagementMix(totals: MonthSummary): { label: string; value: number }[] {
  return [
    { label: "Likes", value: totals.likes },
    { label: "Comments", value: totals.comments },
    { label: "Reposts", value: totals.reposts }
  ].filter((entry) => entry.value > 0);
}

function buildDayOfWeekSummary(daily: DailyMetric[]): DayOfWeekSummary[] {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDate = new Map<string, { date: Date; views: number }>();

  daily.forEach((metric) => {
    const key = toDayKey(metric.date);
    const existing = byDate.get(key) ?? { date: metric.date, views: 0 };
    existing.views += metric.views;
    byDate.set(key, existing);
  });

  const summary = dayNames.map((day) => ({
    day,
    averageViews: 0,
    totalViews: 0,
    days: 0
  }));

  byDate.forEach((entry) => {
    const index = entry.date.getUTCDay();
    const bucket = summary[index];
    bucket.totalViews += entry.views;
    bucket.days += 1;
  });

  summary.forEach((bucket) => {
    bucket.averageViews = bucket.days ? bucket.totalViews / bucket.days : 0;
  });

  return summary;
}

async function loadXVideoOverviewByDate(): Promise<{
  videoMap: Map<string, { views: number; watchTimeMs: number; completionRate: number }>;
  validation: CsvValidation;
}> {
  const videoMap = new Map<
    string,
    { views: number; watchTimeMs: number; completionRate: number }
  >();
  const source = await readCsvWithFallback(
    X_VIDEO_OVERVIEW_CSV,
    X_VIDEO_OVERVIEW_CSV_SAMPLE
  );
  const parsed = source.text ? parseCsvWithHeader(source.text, "Date") : null;
  const headers = parsed?.headers ?? [];
  const rows = parsed?.rows ?? [];

  const validation = buildCsvValidation({
    id: "x-video-overview",
    label: "X video overview",
    filePath: source.filePath,
    source: source.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Date", fields: ["Date"] },
      { label: "Views", fields: ["Views"] },
      { label: "Watch Time (ms)", fields: ["Watch Time (ms)"] }
    ],
    optionalGroups: [{ label: "Completion Rate", fields: ["Completion Rate"] }]
  });

  rows.forEach((row) => {
    const date = parseXDate(String(pickField(row, ["Date"])));
    if (!date) return;

    const views = toNumber(pickField(row, ["Views"]));
    const watchTimeMs = toNumber(pickField(row, ["Watch Time (ms)"]));
    const completionRate = toNumber(pickField(row, ["Completion Rate"])) / 100;

    videoMap.set(toDayKey(date), { views, watchTimeMs, completionRate });
  });

  return { videoMap, validation };
}

async function loadXPostsData(): Promise<{
  topPosts: XPostSummary[];
  validation: CsvValidation;
}> {
  const rawPath = await resolveXPostsFilePath();
  const source = await readCsvWithFallback(rawPath ?? X_POSTS_CSV, X_POSTS_CSV_SAMPLE);
  const parsed = source.text ? parseCsvWithHeader(source.text, "Impressions") : null;
  const headers = parsed?.headers ?? [];
  const rows = parsed?.rows ?? [];

  const validation = buildCsvValidation({
    id: "x-posts",
    label: "X post analytics",
    filePath: source.filePath,
    source: source.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Impressions", fields: ["Impressions"] },
      { label: "Post text or link", fields: ["Tweet text", "Text", "Post text", "Post", "Tweet", "Tweet permalink", "Post Link", "Permalink"] }
    ],
    optionalGroups: [
      { label: "Likes", fields: ["Likes"] },
      { label: "Replies", fields: ["Replies"] },
      { label: "Reposts", fields: ["Reposts", "Retweets", "Retweets (organic)"] },
      { label: "Engagements", fields: ["Engagements"] },
      { label: "Engagement rate", fields: ["Engagement rate"] },
      { label: "Created at", fields: ["Time", "time", "Created at", "Date"] }
    ]
  });

  const posts = rows
    .map((row) => {
      const impressions = toNumber(pickField(row, ["Impressions"]));
      const likes = toNumber(pickField(row, ["Likes"]));
      const replies = toNumber(pickField(row, ["Replies"]));
      const reposts = toNumber(
        pickField(row, ["Reposts", "Retweets", "Retweets (organic)"])
      );
      const engagements = toNumber(pickField(row, ["Engagements"]));
      const engagementRate =
        parseRate(pickField(row, ["Engagement rate"])) ??
        calculateEngagementRate(impressions, likes, replies, reposts);

      const text = decodeHtmlEntities(
        String(
          pickField(row, ["Tweet text", "Text", "Post text", "Tweet", "Post"])
        ).trim()
      );
      const link = String(
        pickField(row, [
          "Post Link",
          "Tweet permalink",
          "URL",
          "Tweet URL",
          "Permalink"
        ])
      ).trim();
      const createdAt = parseXPostDate(
        pickField(row, ["time", "Time", "Created at", "Date"])
      );

      if (!text && !link) return null;

      return {
        text: sanitizeTitle(text),
        link,
        createdAt,
        impressions,
        likes,
        replies,
        reposts,
        engagements,
        engagementRate
      } as XPostSummary;
    })
    .filter(Boolean) as XPostSummary[];

  const topPosts = posts
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  return { topPosts, validation };
}

function calculateMomGrowth(monthly: MonthSummary[]): {
  mom: Record<string, number | null>;
  lastMonthLabel: string;
  previousMonthLabel: string;
} {
  if (monthly.length < 2) {
    return {
      mom: {
        views: null,
        likes: null,
        comments: null,
        reposts: null,
        posts: null
      },
      lastMonthLabel: monthly[0]?.label ?? "n/a",
      previousMonthLabel: "n/a"
    };
  }

  const last = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];

  return {
    mom: {
      views: percentDelta(prev.views, last.views),
      likes: percentDelta(prev.likes, last.likes),
      comments: percentDelta(prev.comments, last.comments),
      reposts: percentDelta(prev.reposts, last.reposts),
      posts: percentDelta(prev.posts, last.posts)
    },
    lastMonthLabel: last.label,
    previousMonthLabel: prev.label
  };
}

// ----------------------------
// Parsing + normalization utilities
// ----------------------------

function parseLinkedInCsvRows(
  csvText: string,
  headerLabel: string
): { headers: string[]; rows: Record<string, unknown>[] } {
  return parseCsvWithHeader(csvText, headerLabel);
}

function parseCsvWithHeader(
  csvText: string,
  headerLabel: string
): { headers: string[]; rows: Record<string, unknown>[] } {
  try {
    const rawRows = parseCsv(csvText, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true
    }) as string[][];

    const target = headerLabel.trim().toLowerCase();
    const headerRowIndex = rawRows.findIndex((row) =>
      row.some((cell) => String(cell).trim().toLowerCase() === target)
    );

    if (headerRowIndex === -1) {
      return { headers: [], rows: [] };
    }

    const headers = rawRows[headerRowIndex].map((cell) => String(cell).trim());
    const rows = rawRows
      .slice(headerRowIndex + 1)
      .filter((row) => row.some((cell) => String(cell).trim() !== ""))
      .map((row) =>
        headers.reduce<Record<string, unknown>>((acc, header, index) => {
          acc[header] = row[index] ?? "";
          return acc;
        }, {})
      );

    return { headers, rows };
  } catch (error) {
    return { headers: [], rows: [] };
  }
}

async function loadLinkedInPostsData(): Promise<{
  postsByDate: Map<string, number>;
  topPosts: LinkedInPostSummary[];
  topPostsByRate: LinkedInPostSummary[];
  contentTypes: LinkedInContentTypeSummary[];
  bestTimes: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  validation: CsvValidation;
}> {
  const postsByDate = new Map<string, number>();
  const topPosts: LinkedInPostSummary[] = [];
  const topPostsByRate: LinkedInPostSummary[] = [];
  const contentTypeMap = new Map<string, LinkedInContentTypeSummary>();
  const timeSlotMap = new Map<string, BestTimeSlot>();
  let timeOfDayAvailable = false;
  const source = await readCsvWithFallback(
    LINKEDIN_POSTS_CSV,
    LINKEDIN_POSTS_CSV_SAMPLE
  );
  const parsed = source.text ? parseLinkedInCsvRows(source.text, "Created date") : null;
  const headers = parsed?.headers ?? [];
  const rows = parsed?.rows ?? [];

  const validation = buildCsvValidation({
    id: "linkedin-posts",
    label: "LinkedIn post analytics",
    filePath: source.filePath,
    source: source.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Created date", fields: ["Created date", "Created Date"] },
      { label: "Impressions", fields: ["Impressions"] }
    ],
    optionalGroups: [
      { label: "Views", fields: ["Views"] },
      { label: "Clicks", fields: ["Clicks"] },
      { label: "Likes", fields: ["Likes"] },
      { label: "Comments", fields: ["Comments"] },
      { label: "Reposts", fields: ["Reposts"] },
      { label: "Post title", fields: ["Post title"] },
      { label: "Post link", fields: ["Post link"] },
      { label: "Content Type", fields: ["Content Type", "Post type"] }
    ]
  });

  rows.forEach((row) => {
    const dateValue = pickField(row, ["Created date", "Created Date"]);
    const rawDate = String(dateValue ?? "").trim();
    if (rawDate.includes(":")) {
      timeOfDayAvailable = true;
    }
    const createdAt = parseLinkedInDateTime(dateValue);
    if (!createdAt) return;

    const key = toDayKey(createdAt);
    postsByDate.set(key, (postsByDate.get(key) ?? 0) + 1);

    const impressions = toNumber(pickField(row, ["Impressions"]));
    const views = toNumber(pickField(row, ["Views"]));
    const clicks = toNumber(pickField(row, ["Clicks"]));
    const likes = toNumber(pickField(row, ["Likes"]));
    const comments = toNumber(pickField(row, ["Comments"]));
    const reposts = toNumber(pickField(row, ["Reposts"]));
    const engagementRateRaw = pickField(row, [
      "Engagement rate",
      "Engagement rate (total)"
    ]);

    const engagementRate =
      parseRate(engagementRateRaw) ??
      calculateEngagementRate(impressions, likes, comments, reposts);

    const postSummary: LinkedInPostSummary = {
      title: sanitizeTitle(String(pickField(row, ["Post title"])).trim()),
      link: String(pickField(row, ["Post link"])).trim(),
      createdAt,
      impressions,
      views,
      clicks,
      likes,
      comments,
      reposts,
      engagementRate,
      contentType: String(pickField(row, ["Content Type", "Post type"])).trim()
    };

    topPosts.push(postSummary);
    topPostsByRate.push(postSummary);

    const contentType =
      String(pickField(row, ["Content Type", "Post type"])).trim() ||
      "Unknown";
    const current = contentTypeMap.get(contentType) ?? {
      type: contentType,
      posts: 0,
      impressions: 0,
      views: 0,
      engagements: 0
    };
    current.posts += 1;
    current.impressions += impressions;
    current.views += views;
    current.engagements += likes + comments + reposts;
    contentTypeMap.set(contentType, current);

    const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
      createdAt.getUTCDay()
    ];
    const hour = rawDate.includes(":") ? createdAt.getUTCHours() : null;
    const slotKey = hour === null ? dayName : `${dayName}-${hour}`;
    const slot =
      timeSlotMap.get(slotKey) ?? {
        label: hour === null ? dayName : `${dayName} ${String(hour).padStart(2, "0")}:00`,
        day: dayName,
        hour,
        posts: 0,
        impressions: 0,
        engagements: 0,
        engagementRate: null
      };
    slot.posts += 1;
    slot.impressions += impressions;
    slot.engagements += likes + comments + reposts;
    slot.engagementRate = slot.impressions
      ? slot.engagements / slot.impressions
      : null;
    timeSlotMap.set(slotKey, slot);
  });

  // Rank by impressions first, then by views as a tiebreaker.
  const sortedTopPosts = topPosts
    .filter((post) => post.title || post.link)
    .sort((a, b) => {
      if (b.impressions !== a.impressions) {
        return b.impressions - a.impressions;
      }
      return b.views - a.views;
    })
    .slice(0, 5);

  const contentTypes = Array.from(contentTypeMap.values())
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 6);

  const sortedTopPostsByRate = topPostsByRate
    .filter((post) => post.engagementRate !== null)
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
    .slice(0, 5);

  const bestTimes = Array.from(timeSlotMap.values())
    .filter((slot) => slot.posts > 0)
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
    .slice(0, 5);

  return {
    postsByDate,
    topPosts: sortedTopPosts,
    topPostsByRate: sortedTopPostsByRate,
    contentTypes,
    bestTimes,
    timeOfDayAvailable,
    validation
  };
}

function toMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const cleaned = String(value).replace(/,/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateEngagementRate(
  impressions: number,
  likes: number,
  comments: number,
  reposts: number
): number | null {
  if (!impressions) return null;
  return (likes + comments + reposts) / impressions;
}

function sanitizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").slice(0, 140);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

async function resolveXPostsFilePath(): Promise<string | null> {
  const explicit = process.env.X_POSTS_CSV_PATH;
  if (explicit) {
    const candidate = resolveDataPath(explicit, DATA_DIR_RAW);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const files = await fs.readdir(DATA_DIR_RAW);
    const match = files
      .filter(
        (name) =>
          name.startsWith("account_analytics_content_") && name.endsWith(".csv")
      )
      .sort()
      .at(-1);
    if (match) {
      return path.join(DATA_DIR_RAW, match);
    }
  } catch (error) {
    // Fall through to default.
  }

  const fallback = resolveDataPath(X_POSTS_CSV, DATA_DIR_RAW);
  return existsSync(fallback) ? fallback : null;
}

function resolveDataPath(fileName: string, baseDir: string): string {
  return path.isAbsolute(fileName) ? fileName : path.join(baseDir, fileName);
}

function percentDelta(previous: number, current: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

function parseXDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  );
}

function parseXPostDate(raw: unknown): Date | null {
  if (!raw) return null;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLinkedInDate(raw: unknown): Date | null {
  const dateTime = parseLinkedInDateTime(raw);
  if (!dateTime) return null;
  return new Date(
    Date.UTC(
      dateTime.getUTCFullYear(),
      dateTime.getUTCMonth(),
      dateTime.getUTCDate()
    )
  );
}

function parseLinkedInDateTime(raw: unknown): Date | null {
  if (!raw) return null;

  if (raw instanceof Date) {
    return raw;
  }

  if (typeof raw === "number") {
    // Excel date serial number (days since 1899-12-30). Fractions include time.
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const millis = raw * 24 * 60 * 60 * 1000;
    return new Date(epoch.getTime() + millis);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const [datePart, timePart, ampmPart] = trimmed.split(/\s+/);
    const datePieces = datePart.split("/");

    if (datePieces.length === 3) {
      const [p1, p2, p3] = datePieces.map((part) => Number(part));
      const month = LINKEDIN_DATE_FORMAT === "MDY" ? p1 : p2;
      const day = LINKEDIN_DATE_FORMAT === "MDY" ? p2 : p1;
      const year = p3;

      if (!Number.isNaN(month) && !Number.isNaN(day) && !Number.isNaN(year)) {
        let hour = 0;
        let minute = 0;

        if (timePart && timePart.includes(":")) {
          const [rawHour, rawMinute] = timePart.split(":").map(Number);
          if (!Number.isNaN(rawHour)) {
            hour = rawHour;
          }
          if (!Number.isNaN(rawMinute)) {
            minute = rawMinute;
          }

          const ampm = ampmPart?.toUpperCase();
          if (ampm === "PM" && hour < 12) {
            hour += 12;
          }
          if (ampm === "AM" && hour === 12) {
            hour = 0;
          }
        }

        return new Date(Date.UTC(year, month - 1, day, hour, minute));
      }
    }

    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  return null;
}

function pickField(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (key in row) return row[key];
  }

  // Case-insensitive fallback for slightly different exports.
  const lower = new Map(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const key of candidates) {
    const value = lower.get(key.toLowerCase());
    if (value !== undefined) return value;
  }

  return "";
}

function applyDateRange(
  metrics: DailyMetric[],
  start: Date,
  end: Date
): DailyMetric[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return metrics.filter((metric) => {
    const ms = metric.date.getTime();
    return ms >= startMs && ms <= endMs;
  });
}
