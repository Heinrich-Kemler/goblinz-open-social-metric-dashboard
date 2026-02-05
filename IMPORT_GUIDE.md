# Import Guide

This dashboard reads CSV files from `Data/raw/`. If a file is missing, it falls back to sample data and the UI will warn you.

## Folder structure

```
Data/
  raw/
    x_account_analytics.csv
    x_post_analytics.csv
    x_video_overview.csv
    linkedin_metrics.csv
    linkedin_posts.csv
```

Only the first two files are required.

## X (Twitter) exports

### 1) Account analytics (required)
- File name: `x_account_analytics.csv`
- Required columns:
  - `Date`
  - `Impressions`
- Useful optional columns:
  - `Likes`, `Replies`, `Reposts` (or `Retweets`), `Shares`, `Bookmarks`
  - `Profile visits`, `Engagements`, `Video views`
  - `Create Post`, `New follows`, `Unfollows`

### 2) Post analytics (optional)
- File name: `x_post_analytics.csv`
- The dashboard also auto-detects files named `account_analytics_content_*.csv`.
- Required columns:
  - `Impressions`
  - Either a post text column (`Tweet text`) or a link column (`Tweet permalink`)

### 3) Video overview (optional)
- File name: `x_video_overview.csv`
- Required columns:
  - `Date`, `Views`, `Watch Time (ms)`

## LinkedIn exports

### 1) Metrics (required)
- File name: `linkedin_metrics.csv`
- Required columns:
  - `Date`
  - `Impressions (total)` or `Impressions`

### 2) Posts (optional)
- File name: `linkedin_posts.csv`
- Required columns:
  - `Created date`
  - `Impressions`

## Troubleshooting

- Check the **Data Quality** section in the dashboard for missing columns.
- Run `npm run inspect:data` to see the headers detected from each CSV.
- If your LinkedIn dates are DMY (day/month/year), change `LINKEDIN_DATE_FORMAT` in `src/lib/metrics.ts`.

## File name overrides (optional)

You can override file names with environment variables:

```bash
X_CSV_PATH="my-x-export.csv" \
X_POSTS_CSV_PATH="my-x-posts.csv" \
X_VIDEO_OVERVIEW_CSV_PATH="my-x-video.csv" \
LINKEDIN_CSV_PATH="my-li-export.csv" \
LINKEDIN_POSTS_CSV_PATH="my-li-posts.csv" \
npm run dev
```
