terraform {
  required_version = ">= 1.9"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.5"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5.15"
    }
  }

  # Partial backend config. The rest (bucket, key, region) is supplied by
  # `backend-config` in .github/workflows/infra.yml, so this file carries no
  # account-specific values.
  #
  # State matters more than usual here: it holds the Supabase database password
  # and the Resend key, both passed in as variables. Use a bucket with
  # encryption and versioning on, and never run this with local state.
  #
  # Prefer HCP Terraform? Replace this whole block with a `cloud {}` block and
  # drop `backend-config` from the workflow.
  backend "s3" {}
}

provider "supabase" {
  # SUPABASE_ACCESS_TOKEN
}

provider "vercel" {
  # VERCEL_API_TOKEN
  team = var.vercel_team_id
}
