// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint', '@nuxtjs/supabase'],

  // Client-rendered SPA. Nitro still serves /api/* routes (the Resend sends,
  // the public RSVP endpoint, the webhook, the reminder cron) as functions.
  ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      title: 'Benteen Events',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Design an e-vite, send it, and track who is coming.' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Server-only — never shipped to the browser. Nitro overrides these from
    // the matching NUXT_* env vars at runtime.
    resendApiKey: '',
    // Verified Resend sender. Must be a domain you've verified with Resend.
    resendFrom: 'Benteen Events <events@example.com>',
    // Signing secret for Resend (Svix) webhooks → /api/webhooks/resend.
    resendWebhookSecret: '',
    // Shared secret guarding the reminder cron route. Vercel Cron sends it as
    // `Authorization: Bearer <CRON_SECRET>`; mapped from the unprefixed env var.
    cronSecret: process.env.CRON_SECRET || '',
    // Absolute site URL used in email links; falls back to the request origin.
    siteUrl: '',

    public: {
      // Branding shown in the UI and baked into every email. Override per
      // deployment so this app can front any event, not just one club.
      appName: 'Benteen Events',
      appTagline: 'Good people, good times.'
    }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // @nuxtjs/supabase reads SUPABASE_URL / SUPABASE_KEY (and
  // NUXT_SUPABASE_SECRET_KEY for the server-side admin actions). The global
  // auth middleware redirects unauthenticated users to /login for every route
  // except those excluded below.
  //
  // `/rsvp` MUST stay excluded: guests answer an e-vite from their inbox with
  // only a token, and have no account to log into.
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/', '/rsvp']
    }
  }
})
