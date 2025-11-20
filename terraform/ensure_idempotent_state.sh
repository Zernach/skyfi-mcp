#!/bin/bash
# Ensures Terraform state matches AWS reality for idempotent deployments
# This script imports any existing resources that are not in state

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

parse_tfvar() {
    local key="$1"

    if [ ! -f "terraform.tfvars" ]; then
        return
    fi

    awk -F= -v lookup_key="$key" '
      $0 ~ "^[[:space:]]*"lookup_key"[[:space:]]*=" {
        value = $2
        sub(/^[[:space:]]+/, "", value)
        sub(/[[:space:]]+$/, "", value)
        gsub(/"/, "", value)
        print value
        exit
      }
    ' terraform.tfvars
}

PROJECT_NAME="${1:-$(parse_tfvar "project_name")}"
ENVIRONMENT="${2:-$(parse_tfvar "environment")}"

PROJECT_NAME="${PROJECT_NAME:-skyfi-mcp}"
ENVIRONMENT="${ENVIRONMENT:-prod}"

ALB_NAME="${PROJECT_NAME}-${ENVIRONMENT}-alb"
TARGET_GROUP_NAME="${PROJECT_NAME}-${ENVIRONMENT}-tg"
ELASTICACHE_SUBNET_GROUP="${PROJECT_NAME}-${ENVIRONMENT}-redis-subnet"
RDS_SUBNET_GROUP="${PROJECT_NAME}-${ENVIRONMENT}-db-subnet"

# Step 1: Recover any secrets scheduled for deletion
echo "🔄 Step 1: Recovering secrets scheduled for deletion..."
./recover_secrets.sh "$PROJECT_NAME" "$ENVIRONMENT"
echo ""

# Step 2: Check and import existing resources
echo "🔍 Step 2: Checking for resources that exist in AWS but not in Terraform state..."
echo ""

# Function to safely import a resource (won't fail if already in state or doesn't exist in AWS)
safe_import() {
    local resource_path="$1"
    local resource_id="$2"
    local resource_name="$3"

    if terraform state show "$resource_path" &>/dev/null; then
        echo "  ✓ $resource_name already in state"
        return 0
    fi

    echo "  → Importing $resource_name..."
    if terraform import "$resource_path" "$resource_id" &>/dev/null; then
        echo "  ✅ $resource_name imported"
        return 0
    else
        echo "  ⊘ $resource_name doesn't exist in AWS (skipping)"
        return 0
    fi
}

echo "Checking ALB resources..."
ALB_ARN=$(aws elbv2 describe-load-balancers --names "$ALB_NAME" --query "LoadBalancers[].LoadBalancerArn" --output text 2>/dev/null || echo "")
if [ -n "$ALB_ARN" ] && [ "$ALB_ARN" != "None" ]; then
    safe_import "module.alb.aws_lb.main" "$ALB_ARN" "ALB"
fi

TG_ARN=$(aws elbv2 describe-target-groups --names "$TARGET_GROUP_NAME" --query "TargetGroups[].TargetGroupArn" --output text 2>/dev/null || echo "")
if [ -n "$TG_ARN" ] && [ "$TG_ARN" != "None" ]; then
    safe_import "module.alb.aws_lb_target_group.main" "$TG_ARN" "Target Group"
fi

echo ""
echo "Checking subnet groups..."
if aws elasticache describe-cache-subnet-groups --cache-subnet-group-name "$ELASTICACHE_SUBNET_GROUP" &>/dev/null; then
    safe_import "module.elasticache.aws_elasticache_subnet_group.main" "$ELASTICACHE_SUBNET_GROUP" "ElastiCache Subnet Group"
fi

if aws rds describe-db-subnet-groups --db-subnet-group-name "$RDS_SUBNET_GROUP" &>/dev/null; then
    safe_import "module.rds.aws_db_subnet_group.main" "$RDS_SUBNET_GROUP" "RDS Subnet Group"
fi

echo ""
echo "✅ State synchronization complete!"
echo ""

