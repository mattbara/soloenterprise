# Product Factory: Bootstrap Guide

## Overview

This document covers the **one-time setup** required before any AI agent can run. You (the human) must complete these steps. There is no way around this—agents cannot create accounts, enable billing, or generate their own credentials.

**Estimated Time:** 2-3 hours  
**Difficulty:** Intermediate (assumes basic CLI familiarity)  
**Prerequisites:** Credit card for GCP billing, GitHub account

---

## Table of Contents

1. [GitHub Setup](#1-github-setup)
2. [GCP Setup](#2-gcp-setup)
3. [Local Environment Setup](#3-local-environment-setup)
4. [Terraform State Bootstrap](#4-terraform-state-bootstrap)
5. [Repository Structure Setup](#5-repository-structure-setup)
6. [Secrets Configuration](#6-secrets-configuration)
7. [Verification Checklist](#7-verification-checklist)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. GitHub Setup

### 1.1 Create Repository

```bash
# Option A: Via GitHub CLI (if installed)
gh repo create product-factory --private --clone

# Option B: Via GitHub Web UI
# 1. Go to https://github.com/new
# 2. Repository name: product-factory
# 3. Private (recommended for now)
# 4. Initialize with README: No (we'll create our own structure)
# 5. Click "Create repository"
```

### 1.2 Generate Personal Access Token (PAT)

GitHub now recommends **Fine-grained tokens** over classic tokens.

1. Go to: `GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens`
2. Click "Generate new token"
3. Configure:
   - **Token name:** `product-factory-automation`
   - **Expiration:** 90 days (set calendar reminder to rotate)
   - **Repository access:** "Only select repositories" → select `product-factory`
   - **Permissions:**
     ```
     Repository permissions:
     ├── Actions: Read and write
     ├── Administration: Read and write
     ├── Contents: Read and write
     ├── Environments: Read and write
     ├── Metadata: Read (automatic)
     ├── Pull requests: Read and write
     ├── Secrets: Read and write
     └── Workflows: Read and write
     ```
4. Click "Generate token"
5. **COPY THE TOKEN NOW** — you cannot see it again

### 1.3 Store Token Securely

```bash
# Option A: GitHub CLI credential store
gh auth login
# Select: GitHub.com
# Select: HTTPS
# Paste your token when prompted

# Option B: Git credential manager (recommended for long-term)
git config --global credential.helper store
# Next git push will prompt for credentials, then remembers them

# Option C: Environment variable (for scripts)
export GITHUB_TOKEN=ghp_your_token_here
# Add to ~/.zshrc or ~/.bashrc for persistence
```

### 1.4 Configure Repository Settings

```bash
# Clone the repo first
git clone https://github.com/YOUR_USERNAME/product-factory.git
cd product-factory

# Set up branch protection via GitHub CLI
gh api repos/{owner}/{repo}/branches/main/protection -X PUT -f required_status_checks='{"strict":true,"contexts":["build","test"]}' -f enforce_admins=false -f required_pull_request_reviews='{"required_approving_review_count":1}' -f restrictions=null
```

Or via UI:
1. Repo → Settings → Branches → Add branch protection rule
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Do not allow bypassing the above settings

### 1.5 Create Required Branches

```bash
cd product-factory

# Create develop branch
git checkout -b develop
git push -u origin develop

# Set develop as default branch (optional, via UI)
# Repo → Settings → General → Default branch → Change to develop
```

---

## 2. GCP Setup

### 2.1 Create GCP Account (If Needed)

1. Go to: https://console.cloud.google.com/
2. Sign in with Google account
3. Accept terms of service

### 2.2 Create GCP Project

```bash
# Install gcloud CLI first (see section 3)
# Then:

# Create project
gcloud projects create product-factory-prod --name="Product Factory Production"

# Set as active project
gcloud config set project product-factory-prod

# Verify
gcloud config get-value project
# Should output: product-factory-prod
```

Or via Console:
1. Go to: https://console.cloud.google.com/projectcreate
2. Project name: `Product Factory Production`
3. Project ID: `product-factory-prod` (or auto-generated)
4. Click "Create"

### 2.3 Enable Billing

**⚠️ Required before any resources can be created**

1. Go to: https://console.cloud.google.com/billing
2. Link a billing account to your project
3. If no billing account exists, create one with a credit card

```bash
# Verify billing is enabled
gcloud beta billing projects describe product-factory-prod
# Should show billingEnabled: true
```

### 2.4 Enable Required APIs

```bash
# Enable all required APIs (run each line)
gcloud services enable compute.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable servicenetworking.googleapis.com

# Verify enabled APIs
gcloud services list --enabled
```

### 2.5 Create Service Account for Terraform

```bash
# Create service account
gcloud iam service-accounts create terraform-admin \
    --display-name="Terraform Admin" \
    --description="Service account for Terraform automation"

# Get the full email
SA_EMAIL="terraform-admin@product-factory-prod.iam.gserviceaccount.com"

# Grant necessary roles
gcloud projects add-iam-policy-binding product-factory-prod \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/editor"

gcloud projects add-iam-policy-binding product-factory-prod \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.admin"

gcloud projects add-iam-policy-binding product-factory-prod \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/cloudsql.admin"

gcloud projects add-iam-policy-binding product-factory-prod \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/iam.serviceAccountAdmin"

gcloud projects add-iam-policy-binding product-factory-prod \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/resourcemanager.projectIamAdmin"

# Verify roles
gcloud projects get-iam-policy product-factory-prod \
    --flatten="bindings[].members" \
    --filter="bindings.members:terraform-admin" \
    --format="table(bindings.role)"
```

### 2.6 Generate Service Account Key

```bash
# Create key file
gcloud iam service-accounts keys create ~/product-factory-terraform-key.json \
    --iam-account=terraform-admin@product-factory-prod.iam.gserviceaccount.com

# Verify key was created
cat ~/product-factory-terraform-key.json | head -5
# Should show JSON starting with {"type": "service_account"...

# Base64 encode for GitHub secrets (needed later)
base64 -i ~/product-factory-terraform-key.json > ~/product-factory-terraform-key.b64

# SECURITY: Move to secure location
mkdir -p ~/.secrets
mv ~/product-factory-terraform-key.json ~/.secrets/
mv ~/product-factory-terraform-key.b64 ~/.secrets/
chmod 600 ~/.secrets/*

echo "⚠️  NEVER commit these files to git!"
```

### 2.7 Create Additional Service Accounts (Optional)

For separation of concerns, you may want separate service accounts:

```bash
# CI/CD service account (for GitHub Actions)
gcloud iam service-accounts create github-actions \
    --display-name="GitHub Actions CI/CD"

# Application runtime service account (for Cloud Run)
gcloud iam service-accounts create app-runtime \
    --display-name="Application Runtime"

# Grant minimal permissions to each (principle of least privilege)
# ... customize based on your needs
```

---

## 3. Local Environment Setup

### 3.1 Install Required Tools

**macOS (using Homebrew):**

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install tools
brew install git
brew install gh                    # GitHub CLI
brew install node                  # Node.js (for Claude Code)
brew install pnpm                  # Package manager
brew install terraform             # Infrastructure as Code
brew install google-cloud-sdk      # GCP CLI
brew install jq                    # JSON processor
brew install docker                # Container runtime (optional if using OrbStack)

# Verify installations
git --version      # git version 2.x.x
gh --version       # gh version 2.x.x
node --version     # v20.x.x or higher
pnpm --version     # 8.x.x or higher
terraform --version # Terraform v1.5.x or higher
gcloud --version   # Google Cloud SDK x.x.x
```

**Linux (Ubuntu/Debian):**

```bash
# Update package list
sudo apt update

# Install git
sudo apt install git

# Install GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Install Node.js (via nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Install pnpm
npm install -g pnpm

# Install Terraform
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update
sudo apt install terraform

# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

**Windows (using winget):**

```powershell
winget install Git.Git
winget install GitHub.cli
winget install OpenJS.NodeJS.LTS
winget install Hashicorp.Terraform
winget install Google.CloudSDK

# Install pnpm
npm install -g pnpm
```

### 3.2 Install Claude Code CLI

```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Authenticate with Anthropic
claude auth login
# Follow the prompts to authenticate via browser

# Verify
claude --version
```

### 3.3 Install Auto-Claude

```bash
# Download latest release for your platform from:
# https://github.com/AndyMik90/Auto-Claude/releases

# macOS (Apple Silicon)
curl -L https://github.com/AndyMik90/Auto-Claude/releases/download/v2.7.2/Auto-Claude-2.7.2-darwin-arm64.dmg -o Auto-Claude.dmg
open Auto-Claude.dmg
# Drag to Applications

# macOS (Intel)
curl -L https://github.com/AndyMik90/Auto-Claude/releases/download/v2.7.2/Auto-Claude-2.7.2-darwin-x64.dmg -o Auto-Claude.dmg
open Auto-Claude.dmg

# Linux (AppImage)
curl -L https://github.com/AndyMik90/Auto-Claude/releases/download/v2.7.2/Auto-Claude-2.7.2-linux-x86_64.AppImage -o Auto-Claude.AppImage
chmod +x Auto-Claude.AppImage
./Auto-Claude.AppImage

# Windows
# Download .exe from releases page and run installer
```

### 3.4 Configure gcloud CLI

```bash
# Initialize gcloud
gcloud init
# Select your Google account
# Select project: product-factory-prod

# Set application default credentials (for Terraform)
gcloud auth application-default login
# This opens browser for OAuth

# Verify configuration
gcloud config list
# Should show:
# [core]
# account = your-email@gmail.com
# project = product-factory-prod
```

### 3.5 Configure Git

```bash
# Set identity
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"

# Set default branch name
git config --global init.defaultBranch main

# Enable credential caching
git config --global credential.helper cache

# Set default editor (optional)
git config --global core.editor "code --wait"  # VS Code
```

---

## 4. Terraform State Bootstrap

Terraform state must be stored remotely for team collaboration and agent access.

### 4.1 Create GCS Bucket for State

```bash
# Create bucket (name must be globally unique)
gsutil mb -l us-central1 gs://product-factory-terraform-state

# Enable versioning (critical for state recovery)
gsutil versioning set on gs://product-factory-terraform-state

# Verify
gsutil ls -b gs://product-factory-terraform-state
gsutil versioning get gs://product-factory-terraform-state
```

### 4.2 Create Terraform Backend Configuration

Create this file in your repo later, but here's what it will look like:

```hcl
# infrastructure/terraform/backend.tf

terraform {
  backend "gcs" {
    bucket = "product-factory-terraform-state"
    prefix = "terraform/state"
  }
}
```

### 4.3 Initialize Terraform (After Repo Setup)

```bash
cd product-factory/infrastructure/terraform

# Initialize with GCS backend
terraform init

# Verify state is remote
terraform state list
# Should be empty initially, but no errors
```

---

## 5. Repository Structure Setup

### 5.1 Create Initial Structure

```bash
cd product-factory

# Create directory structure
mkdir -p docs
mkdir -p docs/runbooks
mkdir -p docs/adr
mkdir -p skills
mkdir -p infrastructure/terraform
mkdir -p infrastructure/terraform/environments/dev
mkdir -p infrastructure/terraform/environments/test
mkdir -p infrastructure/terraform/environments/staging
mkdir -p infrastructure/terraform/environments/prod
mkdir -p .github/workflows
mkdir -p apps/backend
mkdir -p apps/frontend
mkdir -p packages/shared

# Create placeholder files
touch docs/ARCHITECTURE.md
touch docs/CONTRIBUTING.md
touch docs/ENVIRONMENTS.md
touch docs/runbooks/.gitkeep
touch docs/adr/template.md
touch skills/.gitkeep
touch infrastructure/terraform/main.tf
touch infrastructure/terraform/variables.tf
touch infrastructure/terraform/outputs.tf
touch .github/workflows/ci.yml
touch apps/backend/.gitkeep
touch apps/frontend/.gitkeep
touch packages/shared/.gitkeep
```

### 5.2 Create README.md

```bash
cat > README.md << 'EOF'
# Product Factory

AI-powered development team orchestration system.

## Quick Start

1. See [BOOTSTRAP.md](docs/BOOTSTRAP.md) for initial setup
2. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
3. See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for development workflow

## Structure

```
product-factory/
├── apps/                    # Application code
│   ├── backend/             # Backend services
│   └── frontend/            # Frontend application
├── docs/                    # Documentation
├── infrastructure/          # Infrastructure as Code
│   └── terraform/           # Terraform configurations
├── packages/                # Shared packages
├── skills/                  # Agent SKILL files
└── .github/workflows/       # CI/CD pipelines
```

## Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Local | Development | http://localhost:3000 |
| Dev | Integration | https://dev.example.com |
| Test | QA | https://test.example.com |
| Staging | Pre-prod | https://staging.example.com |
| Production | Live | https://example.com |

## License

Proprietary - All rights reserved
EOF
```

### 5.3 Create .gitignore

```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.next/
out/

# Environment files
.env
.env.local
.env.*.local
*.env

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Terraform
*.tfstate
*.tfstate.*
.terraform/
*.tfvars
!*.tfvars.example

# Credentials - NEVER COMMIT
*.pem
*.key
*.json
!package.json
!tsconfig.json
credentials/
.secrets/

# Logs
logs/
*.log
npm-debug.log*
pnpm-debug.log*

# Test coverage
coverage/
.nyc_output/

# Temporary files
tmp/
temp/
*.tmp
EOF
```

### 5.4 Initial Commit

```bash
# Add all files
git add .

# Commit
git commit -m "chore: initial project structure"

# Push
git push -u origin main

# Also push to develop
git checkout develop
git merge main
git push -u origin develop
```

---

## 6. Secrets Configuration

### 6.1 Add Secrets to GitHub Repository

```bash
# Using GitHub CLI

# GCP Service Account Key (base64 encoded)
gh secret set GCP_SA_KEY < ~/.secrets/product-factory-terraform-key.b64

# GCP Project ID
gh secret set GCP_PROJECT_ID --body "product-factory-prod"

# GitHub Token (for workflows that need to create PRs, etc.)
gh secret set GH_TOKEN --body "ghp_your_token_here"
```

Or via UI:
1. Go to: Repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add each secret:
   - `GCP_SA_KEY`: Contents of the base64-encoded key file
   - `GCP_PROJECT_ID`: `product-factory-prod`
   - `GH_TOKEN`: Your Personal Access Token

### 6.2 Add Secrets to GCP Secret Manager (For Production)

```bash
# Create secrets in GCP Secret Manager
echo -n "your-database-password" | gcloud secrets create db-password --data-file=-
echo -n "your-api-key" | gcloud secrets create api-key --data-file=-

# Grant access to runtime service account
gcloud secrets add-iam-policy-binding db-password \
    --member="serviceAccount:app-runtime@product-factory-prod.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 6.3 Environment Variables Template

Create a template for local development:

```bash
cat > .env.example << 'EOF'
# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/product_factory_dev

# Redis
REDIS_URL=redis://localhost:6379

# GCP (for local development with real GCP services)
GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/product-factory-terraform-key.json
GCP_PROJECT_ID=product-factory-prod

# GitHub
GITHUB_TOKEN=ghp_your_token_here

# Application
NODE_ENV=development
PORT=3000
EOF
```

---

## 7. Verification Checklist

Run through this checklist to verify everything is set up correctly:

### GitHub Verification

```bash
# Check GitHub CLI authentication
gh auth status
# ✓ Logged in to github.com as YOUR_USERNAME

# Check repository access
gh repo view
# Should show your repo details

# Check secrets are set
gh secret list
# Should show: GCP_SA_KEY, GCP_PROJECT_ID, GH_TOKEN

# Check branch protection
gh api repos/{owner}/{repo}/branches/main/protection
# Should show protection rules (or 404 if not set)
```

### GCP Verification

```bash
# Check gcloud authentication
gcloud auth list
# * your-email@gmail.com (active)

# Check project
gcloud config get-value project
# product-factory-prod

# Check APIs are enabled
gcloud services list --enabled | grep -E "(run|build|sql|secret)"
# Should show: run, cloudbuild, sqladmin, secretmanager

# Check service account
gcloud iam service-accounts list
# terraform-admin@product-factory-prod.iam.gserviceaccount.com

# Check Terraform state bucket
gsutil ls gs://product-factory-terraform-state
# Should not error (may be empty)
```

### Terraform Verification

```bash
cd product-factory/infrastructure/terraform

# Initialize
terraform init
# Should show: Terraform has been successfully initialized!

# Validate (even with empty config)
terraform validate
# Success! The configuration is valid.
```

### Claude Tools Verification

```bash
# Check Claude Code
claude --version
# Should show version number

# Check Auto-Claude
# Open Auto-Claude app
# Should connect and show Kanban board
```

### Full Integration Test

```bash
# Create a test branch
git checkout -b test/bootstrap-verification

# Create a test file
echo "# Bootstrap Test" > test-bootstrap.md
git add test-bootstrap.md
git commit -m "test: verify bootstrap setup"

# Push and create PR
git push -u origin test/bootstrap-verification
gh pr create --title "Test: Bootstrap Verification" --body "Testing that all systems are connected."

# Verify PR was created
gh pr view

# Clean up
gh pr close --delete-branch
git checkout develop
```

---

## 8. Troubleshooting

### GitHub Issues

**Problem:** `gh auth login` fails
```bash
# Solution: Use web-based authentication
gh auth login --web
```

**Problem:** Permission denied when pushing
```bash
# Solution: Check remote URL and credentials
git remote -v
# If HTTPS, ensure token is correct
# If SSH, ensure key is added: ssh-add -l
```

### GCP Issues

**Problem:** "Billing account not found"
```bash
# Solution: Link billing account via Console
# https://console.cloud.google.com/billing/linkedaccount
```

**Problem:** "API not enabled"
```bash
# Solution: Enable the specific API
gcloud services enable SERVICE_NAME.googleapis.com
```

**Problem:** "Permission denied" for service account
```bash
# Solution: Grant necessary roles
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:SA_EMAIL" \
    --role="roles/ROLE_NAME"
```

### Terraform Issues

**Problem:** "Backend initialization required"
```bash
# Solution: Run terraform init
terraform init -reconfigure
```

**Problem:** "Error acquiring state lock"
```bash
# Solution: Force unlock (use with caution!)
terraform force-unlock LOCK_ID
```

### Auto-Claude Issues

**Problem:** "OAuth token invalid"
```bash
# Solution: Re-authenticate
claude auth logout
claude auth login
```

**Problem:** "Cannot connect to repository"
```bash
# Solution: Ensure you're in a git repository
cd /path/to/product-factory
git status  # Should show you're in a repo
```

---

## Summary

After completing this guide, you will have:

- ✅ GitHub repository with branch protection
- ✅ GCP project with billing enabled
- ✅ Service accounts with appropriate permissions
- ✅ Terraform state storage configured
- ✅ Local development environment ready
- ✅ Claude tools installed and authenticated
- ✅ Secrets configured for CI/CD

**You are now ready to start building with AI agents.**

---

## Next Steps

1. Copy SKILL files to `skills/` directory
2. Copy ARCHITECTURE.md to `docs/` directory
3. Create first CI/CD workflow in `.github/workflows/`
4. Start Auto-Claude and create your first task

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-08 | Initial bootstrap guide |
