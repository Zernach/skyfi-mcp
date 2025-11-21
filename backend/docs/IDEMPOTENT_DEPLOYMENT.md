# Idempotent AWS Deployment Guide

This guide explains how to achieve true idempotent deployments where you can run `./deploy.sh` infinite times without changing infrastructure - only updating your application code.

## Overview

The deployment system is designed to be **fully idempotent**:
- ✅ Run `./deploy.sh` as many times as you want
- ✅ Infrastructure is only changed when you modify Terraform configs
- ✅ Application code is always updated to latest
- ✅ No manual intervention needed for routine deployments

## Quick Start

```bash
# First-time deployment (creates infrastructure)
./deploy.sh

# Subsequent deployments (code updates only)
./deploy.sh  # Run this infinite times - safe!
```

## How It Works

### First Deployment
When you run `./deploy.sh` for the first time:
1. Detects no `terraform.tfstate` exists
2. Runs full infrastructure deployment via `terraform/deploy_aws.sh all`
3. Builds Docker image and pushes to ECR
4. Deploys to ECS

### Subsequent Deployments (Idempotent)
When you run `./deploy.sh` after infrastructure exists:
1. **Recovers secrets** scheduled for deletion (ensures AWS Secrets Manager consistency)
2. Checks Terraform state synchronization with AWS
3. Runs `terraform plan` to detect drift
4. **If no infrastructure changes**: Skips terraform apply (idempotent!)
5. Builds and pushes latest Docker image
6. Triggers ECS deployment with new image

**Result**: Infrastructure untouched, only code updated.

## Deployment Commands

### Main Deployment Script

```bash
./deploy.sh                    # Idempotent deployment (recommended)
```

### Manual Control (Advanced)

```bash
cd terraform

# Check what would change
./deploy_aws.sh plan

# Apply infrastructure changes only
./deploy_aws.sh apply          # Idempotent - skips if no changes

# Build and push code
./deploy_aws.sh build          # Always safe

# Deploy to ECS
./deploy_aws.sh deploy         # Always safe - just triggers new deployment

# View logs
./deploy_aws.sh logs

# Check status
./deploy_aws.sh status
```

## Idempotency Guarantees

### What's Idempotent (Safe to Run Repeatedly)

| Command | Idempotent? | What It Does |
|---------|-------------|--------------|
| `./deploy.sh` | ✅ YES | Only updates code if infrastructure unchanged |
| `terraform/deploy_aws.sh apply` | ✅ YES | Skips if no changes detected |
| `terraform/deploy_aws.sh build` | ✅ YES | Builds latest code, no infra changes |
| `terraform/deploy_aws.sh deploy` | ✅ YES | ECS handles rolling updates safely |

### What's NOT Idempotent

| Action | Warning |
|--------|---------|
| Modifying `terraform/*.tf` files | Will trigger infrastructure changes |
| Modifying `terraform.tfvars` | May trigger resource replacements |
| Running `terraform destroy` | Deletes everything (irreversible!) |

## Troubleshooting

### "Secret already scheduled for deletion" Errors

If you encounter errors like:
```
Error: You can't create this secret because a secret with this name is already scheduled for deletion.
```

This happens when secrets were deleted and are in the AWS recovery window. **Solution**:

```bash
cd terraform
./recover_secrets.sh            # Cancels deletion + re-imports secrets into state
terraform apply -auto-approve   # Should work now
```

The deployment scripts call this helper automatically, but you can run it manually if you trigger `terraform apply` directly. It auto-detects the project/environment from `terraform.tfvars`, so no extra arguments are needed.

### "Resource already exists" Errors

If you encounter errors like:
```
Error: ELBv2 Load Balancer (skyfi-mcp-production-alb) already exists
```

This is an AWS eventual consistency issue. **Solution**:

```bash
cd terraform
./force_clean_state.sh         # One-time cleanup
terraform apply -auto-approve   # Should work now
```

### State Drift

If Terraform state doesn't match AWS reality:

```bash
cd terraform
./ensure_idempotent_state.sh   # Syncs state with AWS
terraform plan                  # Verify
```

### First Deployment After Clone

If you're deploying to a workspace where infrastructure already exists:

```bash
cd terraform

# Import existing resources
./import_resources.sh

# Verify state
terraform plan

# Should show "No changes" if properly imported
```

## Best Practices

### 1. Code-Only Updates
For daily development, just run:
```bash
./deploy.sh
```

This is the **fastest** and **safest** way to deploy code changes.

### 2. Infrastructure Changes
When you need to change infrastructure:
```bash
# Edit terraform files
vi terraform/main.tf

# Review changes
cd terraform && ./deploy_aws.sh plan

# Apply carefully
./deploy_aws.sh apply
```

### 3. Verify Idempotency
Test that your deployment is truly idempotent:
```bash
# Run twice in a row
./deploy.sh
./deploy.sh

# Second run should show:
# "✅ Infrastructure already up-to-date (no changes)"
```

### 4. Rollback Strategy
If a deployment causes issues:
```bash
# Revert code changes in git
git revert HEAD

# Deploy previous version
./deploy.sh

# ECS will roll back automatically
```

## Architecture

The idempotent deployment system consists of:

```
deploy.sh                           # Main entry point
├── First run: Full deployment
└── Subsequent runs: Code updates only
    ├── ensure_idempotent_state.sh # Sync Terraform state
    │   ├── recover_secrets.sh      # Recover secrets scheduled for deletion
    │   └── import_resources.sh     # Import existing AWS resources
    ├── terraform plan              # Detect drift
    ├── deploy_aws.sh build         # Build code
    └── deploy_aws.sh deploy        # Deploy to ECS
```

## Environment Variables

No environment variables needed! The system is fully self-contained and uses:
- AWS credentials from `~/.aws/credentials` or environment
- Terraform state from `terraform/terraform.tfstate`
- Configuration from `terraform/terraform.tfvars`

## Monitoring Deployments

### Watch Deployment Progress
```bash
cd terraform
./deploy_aws.sh logs
```

### Check Health
```bash
cd terraform
./deploy_aws.sh status
```

### View Infrastructure
```bash
cd terraform
terraform show
```

## FAQ

**Q: Can I run `./deploy.sh` while a deployment is in progress?**
A: Yes! ECS handles concurrent deployments gracefully.

**Q: Will `./deploy.sh` change my database?**
A: No. RDS and ElastiCache are never modified by code deployments.

**Q: How long does a code-only deployment take?**
A: ~5-10 minutes (Docker build + push + ECS rolling update)

**Q: What if I need to force a full redeployment?**
A: Just run `./deploy.sh` - the system is smart enough to only change what's needed.

**Q: Can I test changes before deploying?**
A: Yes! Use `docker-compose` locally or create a separate environment/branch.

## Summary

The idempotent deployment system ensures:
- ✅ Safe to run `./deploy.sh` unlimited times
- ✅ Infrastructure only changes when explicitly modified
- ✅ Code always updates to latest version
- ✅ Zero-downtime rolling deployments
- ✅ Automatic rollback on failures

**Remember**: For routine code updates, just run `./deploy.sh` - that's it!

