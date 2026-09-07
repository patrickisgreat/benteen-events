# ── Supabase ─────────────────────────────────────────────────────────────────

variable "supabase_organization_id" {
  description = "Supabase organization slug, from the dashboard URL."
  type        = string
}

variable "supabase_region" {
  description = "Region for the project. Put it near your users, not near you."
  type        = string
  default     = "us-east-1"
}

variable "supabase_db_password" {
  description = "Password for the project's Postgres role. Lands in state — see versions.tf."
  type        = string
  sensitive   = true
}

variable "supabase_instance_size" {
  description = "Compute size. `nano` is the free tier."
  type        = string
  default     = "nano"
}

# ── Vercel ───────────────────────────────────────────────────────────────────

variable "vercel_team_id" {
  description = "Vercel team ID. Null for a personal account."
  type        = string
  default     = null
}

variable "github_repo" {
  description = "`owner/name` of the repo Vercel builds from."
  type        = string
  default     = "patrickisgreat/benteen-events"
}

variable "production_domain" {
  description = "Custom domain for production, or empty to use the .vercel.app URL."
  type        = string
  default     = ""
}

# ── App configuration ────────────────────────────────────────────────────────
#
# The Supabase keys are variables rather than reads off `supabase_project`,
# because the provider does not expose them — see infra/README.md. Supply them
# after the project exists.

variable "supabase_url" {
  description = "https://<ref>.supabase.co. Public; protected by RLS, not secrecy."
  type        = string
  default     = ""
}

variable "supabase_anon_key" {
  description = "Anon key. Public by design — safe in the browser."
  type        = string
  default     = ""
}

variable "supabase_service_role_key" {
  description = "Service-role key. SERVER-ONLY. Lands in state — see versions.tf."
  type        = string
  sensitive   = true
  default     = ""
}

variable "resend_api_key" {
  description = "Resend API key. SERVER-ONLY. Lands in state — see versions.tf."
  type        = string
  sensitive   = true
  default     = ""
}

variable "resend_from" {
  description = "Verified Resend sender, e.g. `Benteen Events <events@example.com>`."
  type        = string
  default     = ""
}

variable "resend_webhook_secret" {
  description = "Svix signing secret for /api/webhooks/resend. Starts with whsec_."
  type        = string
  sensitive   = true
  default     = ""
}

variable "cron_secret" {
  description = "Bearer token guarding GET /api/crons/reminders."
  type        = string
  sensitive   = true
  default     = ""
}

variable "app_name" {
  description = "Branding shown in the UI and baked into every email."
  type        = string
  default     = "Benteen Events"
}

variable "app_tagline" {
  description = "Branding line in the e-vite footer."
  type        = string
  default     = "Good people, good times."
}
