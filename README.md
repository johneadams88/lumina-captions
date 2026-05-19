<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ddb834df-67e4-4bf4-947b-d318ab15036c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

Captioning runs in your browser; you do not need API keys for the default flow.

## Deploy to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket) and import the project in [Vercel](https://vercel.com/new).
2. Framework preset **Vite** and output **dist** are set in `vercel.json`; build command is `npm run build`.
3. Deploy. No environment variables are required unless you add cloud features later.
