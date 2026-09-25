# Shared Workflows

Reusable GitHub Actions workflows and actions for JOSS microservices.

## Available Workflows

### `deploy-java-service.yml`

Reusable workflow for deploying Java (Spring Boot) microservices to Google Cloud Run.

### `deploy-cloud-run-image.yml`

Reusable workflow that builds any repo's Dockerfile, pushes the image tagged by commit, and points an existing Cloud Run service at it. It changes **only the image**. The rest of the service is Terraform's (e.g. shared-terraform's `cloud-run-service` module), so a deploy never drifts from a plan. See [Deploying an image to a Terraform-managed service](#deploying-an-image-to-a-terraform-managed-service).

## Available Actions

### `pr-comment`

Posts a check's step outcomes as one PR comment, edited on every push instead of adding a new one. See [Commenting a check on the PR](#commenting-a-check-on-the-pr).

## Usage

### Basic Example (core-service)

```yaml
name: Deploy Core Service

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'pom.xml'
      - 'Dockerfile'
      - '.github/workflows/**'
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'dev'
        type: choice
        options:
          - dev
          - prod

jobs:
  determine-environment:
    name: Determine Environment
    runs-on: ubuntu-latest
    outputs:
      environment: ${{ steps.set-env.outputs.environment }}
    steps:
      - name: Set environment based on trigger
        id: set-env
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "environment=${{ inputs.environment }}" >> $GITHUB_OUTPUT
          elif [[ "${{ github.ref }}" == refs/tags/v* ]]; then
            echo "environment=prod" >> $GITHUB_OUTPUT
          else
            echo "environment=dev" >> $GITHUB_OUTPUT
          fi

  deploy:
    name: Deploy
    needs: [determine-environment]
    uses: lintas-media-danawa/shared-workflows/.github/workflows/deploy-java-service.yml@main
    with:
      service-name: core-service
      environment: ${{ needs.determine-environment.outputs.environment }}
      java-version: '21'
      memory: 512Mi
      cpu: '1'
      min-instances: 0
      max-instances: 10
      db-user: core_service
      db-secret-name: db-core-service-password
      run-tests: true
    secrets: inherit
```

### Example with Additional Secrets (user-service)

```yaml
jobs:
  deploy:
    uses: lintas-media-danawa/shared-workflows/.github/workflows/deploy-java-service.yml@main
    with:
      service-name: user-service
      environment: ${{ needs.determine-environment.outputs.environment }}
      memory: 1Gi
      cpu: '1'
      db-user: user_service
      db-secret-name: db-user-service-password
      additional-env-vars: 'GCS_BUCKET_NAME=${{ vars.GCS_BUCKET_NAME }},KEYCLOAK_ADMIN_USERNAME=admin'
      additional-secrets: 'KEYCLOAK_URL=keycloak-url-{env}:latest,KEYCLOAK_REALM=keycloak-realm-{env}:latest,KEYCLOAK_ADMIN_PASSWORD=keycloak-admin-password-{env}:latest'
    secrets: inherit
```

> **Note:** Use `{env}` as a placeholder in `additional-secrets`. It will be replaced with `dev` or `prod` based on the environment.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `service-name` | Yes | - | Service name (e.g., `core-service`) |
| `environment` | Yes | - | Target environment (`dev` or `prod`) |
| `java-version` | No | `21` | Java version |
| `memory` | No | `512Mi` | Cloud Run memory allocation |
| `cpu` | No | `1` | Cloud Run CPU allocation |
| `min-instances` | No | `0` | Minimum instances (prod always uses 1) |
| `max-instances` | No | `10` | Maximum instances |
| `db-user` | Yes | - | Database username |
| `db-secret-name` | Yes | - | DB password secret base name (without `-dev`/`-prod` suffix) |
| `additional-env-vars` | No | `''` | Additional env vars (`KEY1=val1,KEY2=val2`) |
| `additional-secrets` | No | `''` | Additional secrets (`VAR=secret-{env}:latest`) |
| `run-tests` | No | `true` | Run tests before deployment |
| `timeout` | No | `300s` | Request timeout |
| `concurrency-limit` | No | `80` | Max concurrent requests |

## Environment Configuration

### Deployment Flow

| Trigger | Environment | Approval |
|---------|-------------|----------|
| Push to `main` | DEV | Auto |
| Tag `v*` | PROD | Manual approval required |
| Manual dispatch | Selected | Based on selection |

### Required GitHub Variables

Set these at the organization or repository level:

**DEV Environment:**
- `GCP_PROJECT_ID_DEV` - GCP project ID (e.g., `joss-mvp`)
- `GCP_REGION_DEV` - GCP region (e.g., `asia-southeast1`)
- `ARTIFACT_REGISTRY_URL_DEV` - Artifact Registry URL (e.g., `asia-southeast1-docker.pkg.dev/joss-mvp/joss-dev`)
- `VPC_CONNECTOR_DEV` - VPC connector name (e.g., `joss-vpc-dev`)
- `CLOUDSQL_CONNECTION_DEV` - CloudSQL connection string (e.g., `joss-mvp:asia-southeast1:joss-dev-6590c067`)
- `DB_NAME_DEV` - Database name (e.g., `jossdb`)
- `USER_SERVICE_URL_DEV` - User service URL (e.g., `https://user-service-e4ddn6o4sq-as.a.run.app`)
- `CORE_SERVICE_URL_DEV` - Core service URL (e.g., `https://core-service-e4ddn6o4sq-as.a.run.app`)
- `APPLICATION_SERVICE_URL_DEV` - Application service URL (e.g., `https://application-service-e4ddn6o4sq-as.a.run.app`)

**PROD Environment:**
- `GCP_PROJECT_ID_PROD` - GCP project ID (e.g., `joss-lmd`)
- `GCP_REGION_PROD` - GCP region (e.g., `asia-southeast1`)
- `ARTIFACT_REGISTRY_URL_PROD` - Artifact Registry URL (e.g., `asia-southeast1-docker.pkg.dev/joss-lmd/joss-prod`)
- `VPC_CONNECTOR_PROD` - VPC connector name (e.g., `joss-vpc-prod`)
- `CLOUDSQL_CONNECTION_PROD` - CloudSQL connection string (e.g., `joss-lmd:asia-southeast1:joss-prod-ee893f3e`)
- `DB_NAME_PROD` - Database name (e.g., `jossdb`)
- `USER_SERVICE_URL_PROD` - User service URL (e.g., `https://user-service-iujdf4jimq-as.a.run.app`)
- `CORE_SERVICE_URL_PROD` - Core service URL (e.g., `https://core-service-iujdf4jimq-as.a.run.app`)
- `APPLICATION_SERVICE_URL_PROD` - Application service URL (e.g., `https://application-service-iujdf4jimq-as.a.run.app`)

### Required GitHub Secrets

- `WORKLOAD_IDENTITY_PROVIDER_DEV` - Workload Identity Provider for dev
- `WORKLOAD_IDENTITY_PROVIDER_PROD` - Workload Identity Provider for prod
- `SERVICE_ACCOUNT_EMAIL_DEV` - Service account email for dev deployments
- `SERVICE_ACCOUNT_EMAIL_PROD` - Service account email for prod deployments
- `PAT_TOKEN` - Personal Access Token for shared-lib repository access

### Terraform-Specific Variables

For `terraform-apply.yml` and `terraform-plan.yml` workflows:

**DEV Environment:**
- `TF_STATE_BUCKET_DEV` - Terraform state bucket (e.g., `joss-mvp-terraform-state`)

**PROD Environment:**
- `TF_STATE_BUCKET_PROD` - Terraform state bucket (e.g., `joss-lmd-terraform-state`)

### GitHub Environments

Create these environments in each service repository:

1. **`dev`** - No protection rules
2. **`production`** - Enable "Required reviewers" and add approvers

## Deploying an image to a Terraform-managed service

`deploy-cloud-run-image.yml` is for services whose Cloud Run config lives in Terraform (sso-keycloak, openfga). Unlike `deploy-java-service.yml`, it never sets env vars, secrets, scaling, VPC or IAM; it only runs `gcloud run deploy --image`.

It assumes trunk-based releases: a push to `main` deploys dev, and a `v*` tag, made by release-please, deploys prod.

```yaml
# .github/workflows/deploy.yml in a consuming repo
on:
  push:
    branches: [main]
    tags: ['v*']
    paths: ['src/**', '.github/workflows/deploy.yml'] # a tag push ignores paths

permissions:
  contents: read

jobs:
  deploy:
    uses: lintas-media-danawa/shared-workflows/.github/workflows/deploy-cloud-run-image.yml@<commit SHA>
    permissions: { contents: read, id-token: write }
    with:
      environment: ${{ startsWith(github.ref, 'refs/tags/v') && 'prod' || 'dev' }}
      service: myapp-${{ startsWith(github.ref, 'refs/tags/v') && 'prod' || 'dev' }}
      repository: myapp-${{ startsWith(github.ref, 'refs/tags/v') && 'prod' || 'dev' }}
      image: myapp
      region: asia-southeast1
      context: src
      dockerfile: src/Dockerfile
    secrets: inherit

  # Repo-specific steps after a deploy (e.g. a migration) go in their own
  # job, reading needs.deploy.outputs.image / project_id.
```

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `environment` | Yes | - | GitHub environment holding the WIF secrets (`dev`/`prod`) |
| `service` | Yes | - | Cloud Run service to deploy to |
| `region` | Yes | - | Region of the service and its Artifact Registry repository |
| `repository` | Yes | - | Artifact Registry repository the image is pushed to |
| `image` | Yes | - | Image name inside the repository |
| `context` | No | `.` | Docker build context |
| `dockerfile` | No | `Dockerfile` | Dockerfile path, relative to the repo root |
| `project_id` | No | `''` | GCP project; empty reads `project_id` from `var_file` |
| `var_file` | No | `terraform/environments/<environment>.tfvars` | tfvars file the project is read from |
| `release_branch` | No | `main` | Branch a tag's commit must be on before it deploys |
| `runs_on` | No | `ubuntu-latest` | Runner label |

Outputs: `image`, the full reference deployed (`...:<sha>`), and `project_id`.

**Setting it up in the consuming repo**

- **GitHub environments:** `dev` accepts only the `main` branch, and `prod` only `v*` tags. Set this under Settings → Environments → Deployment branches and tags.
- **Secrets:** each environment holds `WORKLOAD_IDENTITY_PROVIDER` and `SERVICE_ACCOUNT_EMAIL`, under the same names in both, not with `_DEV`/`_PROD` suffixes.
- **Project:** read from the repo's own tfvars, so there are no project or registry variables to keep in sync.

**Guards**

- **Bootstrap check:** fails early when the environment's WIF secrets are empty.
- **Release tag check:** fails on a tag whose commit isn't on `main`, so prod only runs a commit that already went through dev.
- **One rollout at a time:** one per environment and service, and a newer run waits instead of cancelling a deploy halfway.

**Pinning**

This repo has no release tags, so pin a commit SHA rather than `@main`. The workflow receives the deploy identity, so a change on `main` would otherwise reach every repo's deploy immediately.

## Commenting a check on the PR

`pr-comment` posts a check's step outcomes as one PR comment.

- Every push edits that comment instead of adding a new one.
- Run it with `if: always()`, so a failed step still gets reported.
- Outside a pull request it does nothing.
- The calling job needs `pull-requests: write`.

```yaml
permissions:
  pull-requests: write

steps:
  # ...
  - name: Comment check on PR
    if: always() && github.event_name == 'pull_request'
    uses: lintas-media-danawa/shared-workflows/.github/actions/pr-comment@main
    with:
      marker: model-test:${{ env.ENV }}
      title: Model Test - `${{ env.ENV }}` 🧩
      steps: |
        Format 🖌️ = ${{ steps.fmt.outcome }}
        Test 🧪 = ${{ steps.test.outcome }}
      details_title: Show test output
      details_file: test.txt
```

- `steps` holds one `<label> = <outcome>` per line. An empty outcome, from a step that didn't run, shows as skipped.
- `marker` picks the comment to edit, so use one marker per check and environment.
- `summary` adds a bold line below the steps.
- `details_file` becomes a collapsed block below the steps, truncated to fit in a comment. Its path is relative to the workspace. When the file is missing, `details_fallback` is shown instead.
- `delete_markers` removes comments that no longer apply, such as an old plan comment.
- `pr-comment.js` also exports `upsertComment`, `deleteComment` and `read`, for an `actions/github-script` step that `require()`s it.

**Pinning**

`@main` is fine for this action, unlike the deploy workflows: it only gets a token that can comment on PRs.

## Naming Conventions

### Service Accounts

```
{service-name}-{env}@{project-id}.iam.gserviceaccount.com
```

Example: `core-service-dev@joss-mvp.iam.gserviceaccount.com`

### Database Secrets

```
db-{service-name}-password-{env}:latest
```

Example: `db-core-service-password-dev:latest`

### Database Users

| Service | DB User |
|---------|---------|
| core-service | `core_service` |
| user-service | `user_service` |
| job-service | `job_service` |
| application-service | `application_service` |
| document-service | `document_service` |
| ai-service | `ai_service` |

## Service Configuration Reference

| Service | Memory | CPU | DB User | Additional Config |
|---------|--------|-----|---------|-------------------|
| core-service | 512Mi | 1 | core_service | - |
| user-service | 1Gi | 1 | user_service | GCS, Keycloak |
| job-service | 1Gi | 1 | job_service | Keycloak |
| document-service | 512Mi | 1 | document_service | GCS, Keycloak |
| application-service | 512Mi | 1 | application_service | PubSub, Keycloak |
| ai-service | 2Gi | 2 | ai_service | OpenAI, OTEL |

## Migration Guide

1. Create `shared-workflows` repository in GitHub
2. Add `deploy-java-service.yml` workflow from `.github/workflows/`
3. Create GitHub environments (`dev`, `production`) in your service repo
4. Set required variables and secrets at organization or repository level
5. Replace existing `deploy.yml` with the simplified version
6. Test with a push to `main` branch
7. Test production deployment by creating a tag `v1.0.0`

## Comparison: Before vs After

| Metric | Before | After |
|--------|--------|-------|
| Lines per service workflow | ~215 | ~50 |
| Maintenance locations | 6 files | 1 shared file |
| Docker caching | None | Registry cache |
| Change detection | None | Path-based |
| Environment handling | Single | dev/prod with approval |
| Concurrency control | None | Cancel in-progress |
