# Provisioning only — the things you create once and then forget you clicked.
#
# What is deliberately NOT here:
#   • The database schema. That is supabase/migrations/*.sql, applied by the
#     Deploy workflow. Terraform has no business owning DDL.
#   • Auth providers, site URL, redirect allow-list. Those are supabase/config.toml,
#     pushed by the same workflow. Two systems writing the same settings would
#     fight; the CLI wins because it also handles the local dev environment.
#
# Terraform runs rarely — a new environment, a new domain. The workflow runs on
# every merge. Keeping schema out of Terraform is what lets that be true.

resource "supabase_project" "this" {
  name              = var.app_name
  organization_id   = var.supabase_organization_id
  region            = var.supabase_region
  database_password = var.supabase_db_password
  instance_size     = var.supabase_instance_size

  lifecycle {
    # Changing any of these replaces the project — which means dropping the
    # database. Nothing about this app is worth that happening by surprise.
    prevent_destroy = true
  }
}

# Project settings. Auth deliberately omitted: config.toml owns it.
#
# These are free-form JSON by design in the provider, and applied as a partial
# update — anything not named here keeps whatever the dashboard has.
resource "supabase_settings" "this" {
  project_ref = supabase_project.this.id

  api = jsonencode({
    db_schema            = "public"
    db_extra_search_path = "public,extensions"
    # Every query in this app is event-scoped and small.
    max_rows = 1000
  })

  database = jsonencode({
    # A blast to a large guest list is a handful of small writes, not a long
    # transaction. Anything running longer than this is a bug worth failing on.
    statement_timeout = "30s"
  })
}

resource "vercel_project" "this" {
  name      = "benteen-events"
  framework = "nuxtjs"
  team_id   = var.vercel_team_id

  git_repository = {
    type = "github"
    repo = var.github_repo
  }

  # The GitHub Actions workflow owns deploys, so Vercel's own git integration
  # would otherwise deploy every push a second time.
  git_fork_protection   = true
  vercel_authentication = { deployment_type = "standard_protection_new" }

  resource_config = {
    function_default_regions = ["iad1"]
  }
}

# Env vars, split by who is allowed to see them.
#
# `SUPABASE_URL`/`SUPABASE_KEY` reach the browser — that is by design, and RLS is
# what protects the data. Everything else is server-only and must never appear in
# a client bundle.
locals {
  public_env = {
    SUPABASE_URL            = var.supabase_url
    SUPABASE_KEY            = var.supabase_anon_key
    NUXT_PUBLIC_APP_NAME    = var.app_name
    NUXT_PUBLIC_APP_TAGLINE = var.app_tagline
  }

  server_env = {
    NUXT_SUPABASE_SECRET_KEY   = var.supabase_service_role_key
    NUXT_RESEND_API_KEY        = var.resend_api_key
    NUXT_RESEND_FROM           = var.resend_from
    NUXT_RESEND_WEBHOOK_SECRET = var.resend_webhook_secret
    CRON_SECRET                = var.cron_secret
    NUXT_SITE_URL              = var.production_domain != "" ? "https://${var.production_domain}" : ""
  }

  # An empty value means "not supplied yet" — skip it rather than writing a blank
  # that shadows something already set in the dashboard.
  all_env = { for k, v in merge(local.public_env, local.server_env) : k => v if v != "" && v != null }

  # for_each cannot take a value derived from a sensitive one, because the key
  # would leak into resource addresses. The KEYS here are env var names, which
  # are not secret — only the values are — so unwrapping them is safe, and the
  # values below stay sensitive.
  supplied_env_keys = nonsensitive(toset(keys(local.all_env)))
}

resource "vercel_project_environment_variable" "this" {
  for_each = local.supplied_env_keys

  project_id = vercel_project.this.id
  team_id    = var.vercel_team_id
  key        = each.key
  value      = local.all_env[each.key]
  target     = ["production", "preview", "development"]
  sensitive  = contains(keys(local.server_env), each.key)
}

resource "vercel_project_domain" "production" {
  count = var.production_domain != "" ? 1 : 0

  project_id = vercel_project.this.id
  team_id    = var.vercel_team_id
  domain     = var.production_domain
}
