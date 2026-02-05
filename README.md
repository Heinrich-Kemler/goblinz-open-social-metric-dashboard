# Goblinz Open Social Metric Dashboard

Open-source, offline-first dashboard that turns X + LinkedIn CSV exports into a clean month-over-month view of your social growth.

## Preview

![Dashboard preview](public/preview.svg)

## What you get

- Cross-platform KPIs (views, likes, comments, reposts, posts)
- Month-over-month growth cards
- Engagement quality + efficiency ratios
- Top posts per platform
- Day-of-week and best-time insights
- CSV validator + data quality panel
- Downloadable CSV templates
- Theme toggle (neutral + accent)

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Sample data lives in `Data/sample/` and is used automatically when `Data/raw/` is empty.

## Getting results (walkthrough)

1. Download your CSV exports from X and LinkedIn.
2. Place them in `Data/raw/` using the filenames below.
3. Restart the dev server (`npm run dev`).
4. Open the dashboard and check the **Data Quality** section for missing columns.
5. Add the optional files for top posts and video watch time.

## Required CSV files (v1)

- `Data/raw/x_account_analytics.csv`
- `Data/raw/linkedin_metrics.csv`

## Optional CSV files (unlock extra panels)

- `Data/raw/x_post_analytics.csv` (top X posts)
- `Data/raw/x_video_overview.csv` (video watch time)
- `Data/raw/linkedin_posts.csv` (LinkedIn post counts + top posts)

If you prefer different names, use environment variables:

```bash
X_CSV_PATH="my-x-export.csv" \
X_POSTS_CSV_PATH="my-x-posts.csv" \
X_VIDEO_OVERVIEW_CSV_PATH="my-x-video.csv" \
LINKEDIN_CSV_PATH="my-li-export.csv" \
LINKEDIN_POSTS_CSV_PATH="my-li-posts.csv" \
npm run dev
```

## CSV templates

Download blank templates from `public/templates/` or from the **CSV Templates** section inside the dashboard.

## Import guide

See `IMPORT_GUIDE.md` for step-by-step export instructions and the exact columns we look for.

## Non-technical setup help

Use the copy/paste prompt in `PROMPT.md` to ask an LLM to guide you through setup.

## Theme toggle

The theme toggle is in the hero section. To customize the accent palette, edit the CSS variables in `src/app/globals.css`.

## Disclaimer

This is an open-source community tool. CSV exports can change and some edge cases may still be buggy. Use the CSV Validation panel to spot missing columns quickly.

## Share this

If this helps you, please share it with your team or friends.

## License

MIT.
