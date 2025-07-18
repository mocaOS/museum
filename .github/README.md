# GitHub Actions Configuration

## Deploy Workflow

The `deploy.yml` workflow automatically deploys the web and API applications when changes are made to specific paths in the repository.

### Triggers

The workflow runs on:
- Push to `main` branch (production)
- Push to `staging` branch (staging)
- Pull requests to `main` or `staging` branches

### Deployment Conditions

- **Web App**: Deploys when changes are detected in:
  - `apps/web/**`
  - `packages/config/**`

- **API**: Deploys when changes are detected in:
  - `apps/api/**`
  - `packages/config/**`

### Environments

The workflow supports two environments based on the target branch:
- **Production**: Triggered by pushes to `main` branch
- **Staging**: Triggered by pushes to `staging` branch

### Required Secrets

To use this workflow, you need to configure the following GitHub repository secret:

1. Go to your repository on GitHub
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add the following secret:

| Name | Value | Description |
|------|-------|-------------|
| `DEPLOY_TOKEN` | `3\|xaQMrvzWjX7IZNS8KFGwWOJ7DXYAYBWDTm0Yi5EGdfe96b86` | Bearer token for deployment API authentication |

### Deployment URLs

#### Production (main branch)
- **Web**: `https://deploy.qwellco.de/api/v1/deploy?uuid=lkg8kgs440koogcosogs44ww&force=false`
- **API**: `https://deploy.qwellco.de/api/v1/deploy?uuid=pocogc8w48gkskgos4gw004g&force=false`

#### Staging (staging branch)
- **Web**: `https://deploy.qwellco.de/api/v1/deploy?uuid=poc0skkkc0sgoo80c04s8gwk&force=false`
- **API**: `https://deploy.qwellco.de/api/v1/deploy?uuid=uosg0kg8goo008gkgsssc0oc&force=false`

The workflow will automatically make POST requests to the appropriate endpoints based on the target branch with the bearer token when the appropriate file changes are detected. 