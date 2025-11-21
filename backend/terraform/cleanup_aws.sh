#!/bin/bash

# ⚠️  WARNING: This script will DELETE all SkyFi MCP resources from AWS
# Only use this if you want to start completely fresh
# This is DESTRUCTIVE and IRREVERSIBLE

set -e

echo "⚠️  WARNING: This will DELETE all SkyFi MCP production resources!"
echo "This includes:"
echo "  - ALB and Target Groups"
echo "  - ECR Repository (and all images)"
echo "  - ECS Cluster and Services"
echo "  - RDS Database (and all data)"
echo "  - ElastiCache Redis (and all cached data)"
echo "  - Secrets Manager secrets"
echo "  - IAM Roles and Policies"
echo "  - CloudWatch Log Groups"
echo ""
read -p "Are you ABSOLUTELY SURE you want to proceed? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Starting cleanup..."
echo ""

# Delete ALB Resources
echo "Deleting ALB..."
ALB_ARN=$(aws elbv2 describe-load-balancers --names skyfi-mcp-production-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo "")
if [ -n "$ALB_ARN" ] && [ "$ALB_ARN" != "None" ]; then
    aws elbv2 delete-load-balancer --load-balancer-arn "$ALB_ARN" || true
    echo "  Waiting for ALB to delete..."
    sleep 10
fi

TG_ARN=$(aws elbv2 describe-target-groups --names skyfi-mcp-production-tg --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "")
if [ -n "$TG_ARN" ] && [ "$TG_ARN" != "None" ]; then
    aws elbv2 delete-target-group --target-group-arn "$TG_ARN" || true
fi

# Delete ECS Resources
echo "Deleting ECS Service..."
aws ecs update-service --cluster skyfi-mcp-production-cluster --service skyfi-mcp-production-service --desired-count 0 2>/dev/null || true
sleep 5
aws ecs delete-service --cluster skyfi-mcp-production-cluster --service skyfi-mcp-production-service --force 2>/dev/null || true
sleep 10

echo "Deleting ECS Cluster..."
aws ecs delete-cluster --cluster skyfi-mcp-production-cluster 2>/dev/null || true

# Delete ElastiCache
echo "Deleting ElastiCache..."
aws elasticache delete-replication-group --replication-group-id skyfi-mcp-production-redis --final-snapshot-identifier skyfi-mcp-final-$(date +%s) 2>/dev/null || true

# Delete RDS
echo "Deleting RDS..."
aws rds delete-db-instance --db-instance-identifier skyfi-mcp-production --skip-final-snapshot 2>/dev/null || true

# Delete ECR Repository
echo "Deleting ECR Repository..."
aws ecr delete-repository --repository-name skyfi-mcp-production --force 2>/dev/null || true

# Delete Parameter/Subnet Groups
echo "Deleting ElastiCache groups..."
aws elasticache delete-cache-parameter-group --cache-parameter-group-name skyfi-mcp-production-redis7 2>/dev/null || true
aws elasticache delete-cache-subnet-group --cache-subnet-group-name skyfi-mcp-production-redis-subnet 2>/dev/null || true

echo "Deleting RDS groups..."
aws rds delete-db-parameter-group --db-parameter-group-name skyfi-mcp-production-pg15 2>/dev/null || true
aws rds delete-db-subnet-group --db-subnet-group-name skyfi-mcp-production-db-subnet 2>/dev/null || true

# Delete CloudWatch Log Groups
echo "Deleting CloudWatch Log Groups..."
aws logs delete-log-group --log-group-name /ecs/skyfi-mcp-production 2>/dev/null || true
aws logs delete-log-group --log-group-name /aws/elasticache/skyfi-mcp-production/redis/slow-log 2>/dev/null || true
aws logs delete-log-group --log-group-name /aws/elasticache/skyfi-mcp-production/redis/engine-log 2>/dev/null || true
aws logs delete-log-group --log-group-name /aws/vpc/skyfi-mcp-production 2>/dev/null || true

# Delete IAM Roles and Policies
echo "Deleting IAM Roles..."
for role in skyfi-mcp-production-ecs-task-execution-role \
            skyfi-mcp-production-ecs-task-role \
            skyfi-mcp-production-ecs-autoscaling-role \
            skyfi-mcp-production-rds-monitoring-role \
            skyfi-mcp-production-vpc-flow-log-role; do
    # Detach policies
    aws iam list-attached-role-policies --role-name "$role" --query 'AttachedPolicies[].PolicyArn' --output text 2>/dev/null | while read -r policy; do
        aws iam detach-role-policy --role-name "$role" --policy-arn "$policy" 2>/dev/null || true
    done
    # Delete inline policies
    aws iam list-role-policies --role-name "$role" --query 'PolicyNames[]' --output text 2>/dev/null | while read -r policy; do
        aws iam delete-role-policy --role-name "$role" --policy-name "$policy" 2>/dev/null || true
    done
    # Delete role
    aws iam delete-role --role-name "$role" 2>/dev/null || true
done

# Delete Secrets
echo "Deleting Secrets Manager secrets..."
for secret in skyfi-mcp/production/skyfi-api-key \
              skyfi-mcp/production/jwt-secret \
              skyfi-mcp/production/db-password; do
    aws secretsmanager delete-secret --secret-id "$secret" --force-delete-without-recovery 2>/dev/null || true
done

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Now you can run a fresh 'terraform apply' to recreate everything."
echo "Make sure to wait a few minutes for AWS to fully delete resources before applying."

