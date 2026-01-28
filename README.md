# Shared Workflows

Reusable GitHub Actions workflows for JOSS microservices deployment.

## Available Workflows

### `deploy-java-service.yml`

Reusable workflow for deploying Java (Spring Boot) microservices to Google Cloud Run.

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
- `GCP_PROJECT_ID_DEV`
- `GCP_REGION_DEV`
- `ARTIFACT_REGISTRY_URL_DEV`
- `VPC_CONNECTOR_DEV`
- `CLOUDSQL_CONNECTION_DEV`
- `DB_NAME_DEV`

**PROD Environment:**
- `GCP_PROJECT_ID_PROD`
- `GCP_REGION_PROD`
- `ARTIFACT_REGISTRY_URL_PROD`
- `VPC_CONNECTOR_PROD`
- `CLOUDSQL_CONNECTION_PROD`
- `DB_NAME_PROD`

### Required GitHub Secrets

- `WORKLOAD_IDENTITY_PROVIDER_DEV`
- `WORKLOAD_IDENTITY_PROVIDER_PROD`
- `SERVICE_ACCOUNT_EMAIL_DEV`
- `SERVICE_ACCOUNT_EMAIL_PROD`
- `PAT_TOKEN` (for shared-lib repository access)

### GitHub Environments

Create these environments in each service repository:

1. **`dev`** - No protection rules
2. **`production`** - Enable "Required reviewers" and add approvers

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
