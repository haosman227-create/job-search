/**
 * Deployment endpoints. For local development point appUrl at your machine's
 * LAN address running `npm run dev` and use your Supabase project's URL/key
 * (the same public values the web app uses — never the service role).
 */
export const config = {
  appUrl: "https://your-margin-deployment.vercel.app",
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-anon-key",
} as const;
