# infra

Provisioning for Benteen Events: the Supabase project and the Vercel project.

## What lives where

Three systems, deliberately not overlapping:

| | Owns | Runs |
|---|---|---|
| **Terraform** (here) | Supabase + Vercel projects, API/DB settings, Vercel env vars, domain | rarely — new environment, new domain |
| **`supabase/migrations/*.sql`** | schema, RLS, triggers | every merge, via the Deploy workflow |
| **`supabase/config.toml`** | auth providers, site URL, redirect allow-list | every merge, via the Deploy workflow |

Keeping schema out of Terraform is what lets Terraform run rarely. A schema
change should never be gated behind a `terraform apply`.

Auth settings could technically go in `supabase_settings.auth`, but they live in
`config.toml` instead — two systems writing the same field would fight, and the
CLI is the one that also configures local development.

## The two-pass bootstrap

**This is the part that surprises people.** The Supabase Terraform provider
exposes exactly one attribute on `supabase_project`: `id`. It does **not** expose
the anon key, the service-role key, or the API URL.

So Terraform cannot read the keys off the project it just made and hand them to
Vercel in the same apply. Provisioning is two passes:

1. **First apply** — creates both projects. Leave `supabase_url`,
   `supabase_anon_key`, and `supabase_service_role_key` empty; the env-var
   resources skip anything empty rather than writing a blank over something real.
2. **Copy the keys** from the Supabase dashboard (Settings → API).
3. **Second apply** — with the keys set, the Vercel env vars appear.

Steps 2 and 3 happen once per environment, ever. Everything after that is the
Deploy workflow.

There is an upside: the service-role key never enters Terraform state *because
Terraform read it* — it is only there if you chose to pass it in. If you would
rather it never touch state at all, set it directly in the Vercel dashboard and
leave `supabase_service_role_key` empty forever. The config supports that.

## State

The backend is a **partial** S3 config — bucket, key, and region come from
`.github/workflows/infra.yml`, so this directory holds no account-specific values.

State contains the database password, and the Resend and service-role keys if you
supply them. Use a bucket with **encryption and versioning on**, and never run
this with local state. `*.tfstate` is gitignored, but that is a seatbelt, not a
plan.

Prefer HCP Terraform? Replace the `backend "s3" {}` block in `versions.tf` with a
`cloud {}` block and drop `backend-config` from the workflow.

## Running it locally

```bash
cp terraform.tfvars.example terraform.tfvars   # gitignored
export SUPABASE_ACCESS_TOKEN=sbp_...           # supabase.com/dashboard/account/tokens
export VERCEL_API_TOKEN=...                    # vercel.com/account/tokens

terraform init \
  -backend-config=bucket=YOUR_BUCKET \
  -backend-config=key=benteen-events/terraform.tfstate \
  -backend-config=region=us-east-1 \
  -backend-config=encrypt=true

terraform plan
```

## In CI

`.github/workflows/infra.yml` plans on a PR touching `infra/**` and applies on
merge. It needs these repo **variables** (not secrets — none is sensitive):

| Variable | For |
|---|---|
| `TF_STATE_BUCKET` | S3 backend |
| `AWS_REGION` | S3 backend |
| `AWS_TF_ROLE_ARN` | OIDC role Terraform assumes — no long-lived AWS keys |

and the `TF_SECRET_VARS` secret, newline-separated, for everything that must not
appear in a plan comment:

```
supabase_organization_id=...
supabase_db_password=...
supabase_service_role_key=...
resend_api_key=...
resend_webhook_secret=...
cron_secret=...
```

`fail-on-destroy: true` is set on both jobs. The Supabase project holds every
guest email address in the app; a plan that would replace it should stop the
pipeline rather than scroll past in a comment.

## After the first apply

`terraform output` gives you three values that need to go elsewhere by hand,
once:

- `supabase_project_ref` → the `SUPABASE_PROJECT_REF` secret, **and**
  `project_id` in `config.toml`'s `[remotes.production]` block.
- `vercel_project_id` → the `VERCEL_PROJECT_ID` secret.
- `supabase_api_url` → the `SUPABASE_URL` secret.
