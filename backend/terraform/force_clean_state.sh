#!/bin/bash
# Force clean phantom AWS resources that are stuck in AWS's eventual consistency cache
# Run this ONCE if you keep getting "already exists" errors

set -e

echo "⚠️  FORCE CLEANING PHANTOM RESOURCES"
echo "======================================"
echo "This will:"
echo "1. Delete any stuck ALB/Target Group/Subnet Groups from AWS"
echo "2. Wait for AWS to propagate deletions"
echo "3. Clean Terraform state"
echo ""
read -p "Continue? (y/N): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "🧹 Cleaning phantom resources..."
echo ""

# Delete ALB (if exists)
echo "Checking for ALB..."
ALB_ARN=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?LoadBalancerName=='skyfi-mcp-production-alb'].LoadBalancerArn | [0]" --output text 2>/dev/null || echo "")
if [ -n "$ALB_ARN" ] && [ "$ALB_ARN" != "None" ]; then
    echo "  → Deleting ALB: $ALB_ARN"
    aws elbv2 delete-load-balancer --load-balancer-arn "$ALB_ARN" 2>/dev/null || echo "  ⊘ ALB already gone"
    sleep 10
fi

# Delete Target Group (if exists)
echo "Checking for Target Group..."
TG_ARN=$(aws elbv2 describe-target-groups --query "TargetGroups[?TargetGroupName=='skyfi-mcp-production-tg'].TargetGroupArn | [0]" --output text 2>/dev/null || echo "")
if [ -n "$TG_ARN" ] && [ "$TG_ARN" != "None" ]; then
    echo "  → Deleting Target Group: $TG_ARN"
    aws elbv2 delete-target-group --target-group-arn "$TG_ARN" 2>/dev/null || echo "  ⊘ Target Group already gone"
    sleep 5
fi

# Delete ElastiCache Subnet Group (if exists)
echo "Checking for ElastiCache Subnet Group..."
if aws elasticache describe-cache-subnet-groups --cache-subnet-group-name skyfi-mcp-production-redis-subnet &>/dev/null; then
    echo "  → Deleting ElastiCache Subnet Group"
    aws elasticache delete-cache-subnet-group --cache-subnet-group-name skyfi-mcp-production-redis-subnet 2>/dev/null || echo "  ⊘ Already gone"
    sleep 2
fi

# Delete RDS Subnet Group (if exists)
echo "Checking for RDS Subnet Group..."
if aws rds describe-db-subnet-groups --db-subnet-group-name skyfi-mcp-production-db-subnet &>/dev/null; then
    echo "  → Deleting RDS Subnet Group"
    aws rds delete-db-subnet-group --db-subnet-group-name skyfi-mcp-production-db-subnet 2>/dev/null || echo "  ⊘ Already gone"
    sleep 2
fi

echo ""
echo "⏳ Waiting 30 seconds for AWS to propagate deletions..."
sleep 30

echo ""
echo "🧹 Cleaning Terraform state..."
terraform state rm module.alb.aws_lb.main 2>/dev/null || echo "  → ALB not in state"
terraform state rm module.alb.aws_lb_target_group.main 2>/dev/null || echo "  → Target Group not in state"
terraform state rm module.elasticache.aws_elasticache_subnet_group.main 2>/dev/null || echo "  → ElastiCache subnet group not in state"
terraform state rm module.rds.aws_db_subnet_group.main 2>/dev/null || echo "  → RDS subnet group not in state"

echo ""
echo "✅ Force clean complete!"
echo ""
echo "Next steps:"
echo "  1. Run: terraform plan (should show clean plan to create resources)"
echo "  2. Run: terraform apply -auto-approve"
echo ""

