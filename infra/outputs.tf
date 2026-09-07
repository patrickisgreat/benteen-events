output "supabase_project_ref" {
  description = "Set this as the SUPABASE_PROJECT_REF secret, and as project_id in config.toml's [remotes.production]."
  value       = supabase_project.this.id
}

output "vercel_project_id" {
  description = "Set this as the VERCEL_PROJECT_ID secret."
  value       = vercel_project.this.id
}

output "supabase_api_url" {
  description = "Derived from the ref — the provider does not expose it directly."
  value       = "https://${supabase_project.this.id}.supabase.co"
}
