#!/bin/bash
# Idempotent deployment script for SkyFi MCP
# Can be run infinite times - only updates codebase, not infrastructure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/terraform"

echo "======================================"
echo "SkyFi MCP - Idempotent Deployment"
echo "======================================"
echo ""

# Check if this is first-time setup or update
cd "$TERRAFORM_DIR"

# Check if Terraform is initialized
if [ ! -d ".terraform" ]; then
    echo "🔄 Initializing Terraform..."
    terraform init
    echo ""
fi

# Check if infrastructure exists in AWS (even if state file is missing)
# This handles the case where infrastructure was created but state was lost
INFRASTRUCTURE_EXISTS=false
if terraform output -raw ecs_cluster_name >/dev/null 2>&1; then
    INFRASTRUCTURE_EXISTS=true
else
    # Try to detect if cluster exists in AWS directly
    CLUSTER_NAME=$(aws ecs list-clusters --region us-east-1 --query 'clusterArns[?contains(@, `skyfi-mcp-prod-v2-cluster`)][0]' --output text 2>/dev/null | sed 's|.*/||' || echo "")
    if [ -n "$CLUSTER_NAME" ]; then
        echo "⚠️  Infrastructure exists in AWS but Terraform state may be missing."
        echo "   Attempting to continue with code deployment..."
        INFRASTRUCTURE_EXISTS=true
    fi
fi

if [ ! -f "terraform.tfstate" ] || [ ! -s "terraform.tfstate" ]; then
    if [ "$INFRASTRUCTURE_EXISTS" = "true" ]; then
        echo "⚠️  Terraform state file not found, but infrastructure appears to exist."
        echo "   Attempting code-only deployment..."
        echo ""
        # Try to proceed with code deployment
        echo "Building and deploying latest code..."
        ./deploy.sh build
        echo ""
        ./deploy.sh deploy
        echo ""
    else
        echo "🔄 First-time deployment detected..."
        echo "   Running full infrastructure setup..."
        echo ""
        
        # Deploy infrastructure (will require manual approval)
        ./deploy.sh all
    fi
else
    # Ensure state is synchronized with AWS (handles drift and imports)
    if [ -f "./ensure_idempotent_state.sh" ]; then
        ./ensure_idempotent_state.sh
        echo ""
    fi
    echo "✅ Infrastructure already deployed"
    echo "   Running code-only update (idempotent)..."
    echo ""
    
    # Ensure infrastructure is up-to-date (idempotent - won't change if nothing changed)
    echo "Checking infrastructure state..."
    terraform plan -detailed-exitcode -out=tfplan.tmp > /dev/null 2>&1
    PLAN_EXIT=$?
    
    if [ $PLAN_EXIT -eq 2 ]; then
        echo "⚠️  Infrastructure drift detected!"
        echo ""
        terraform plan
        echo ""
        read -p "Apply infrastructure changes? (y/N): " CONFIRM
        if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
            terraform apply
        else
            echo "Skipping infrastructure changes..."
        fi
    elif [ $PLAN_EXIT -eq 0 ]; then
        echo "✅ Infrastructure is up-to-date (no changes needed)"
    fi
    rm -f tfplan.tmp
    echo ""
    
    # Build and deploy new code (always safe and idempotent)
    echo "Building and deploying latest code..."
    ./deploy.sh build
    echo ""
    ./deploy.sh deploy
    echo ""
fi

echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""

cd "$TERRAFORM_DIR"
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
if [ -n "$ALB_DNS" ]; then
    echo "Application URL: http://$ALB_DNS"
    echo ""
fi

echo "This script is idempotent - run it as many times as needed!"
echo ""
echo "Useful commands:"
echo "  ./deploy.sh                    - Idempotent deploy (code updates only)"
echo "  cd terraform && ./deploy.sh status  - Check status"
echo "  cd terraform && ./deploy.sh logs    - View logs"