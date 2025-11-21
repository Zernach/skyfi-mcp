#!/bin/bash

# Force destroy stuck Terraform resources
# Use this when terraform destroy hangs on "Still destroying..."

set -e

echo "🚨 Force Destroying Stuck Resources..."
echo ""

# Force stop and delete ECS service first
echo "1️⃣ Force deleting ECS Service..."
ECS_SERVICE=$(aws ecs list-services --cluster skyfi-mcp-production-cluster --query 'serviceArns[0]' --output text 2>/dev/null || echo "")
if [ -n "$ECS_SERVICE" ] && [ "$ECS_SERVICE" != "None" ]; then
    echo "   Scaling service to 0..."
    aws ecs update-service \
        --cluster skyfi-mcp-production-cluster \
        --service skyfi-mcp-production-service \
        --desired-count 0 \
        --force-new-deployment 2>/dev/null || true
    
    sleep 5
    
    echo "   Force deleting service..."
    aws ecs delete-service \
        --cluster skyfi-mcp-production-cluster \
        --service skyfi-mcp-production-service \
        --force 2>/dev/null || true
    
    echo "   Waiting for service deletion..."
    sleep 10
fi

# List and stop all tasks
echo "2️⃣ Stopping all ECS tasks..."
TASKS=$(aws ecs list-tasks --cluster skyfi-mcp-production-cluster --query 'taskArns' --output text 2>/dev/null || echo "")
if [ -n "$TASKS" ] && [ "$TASKS" != "None" ]; then
    for task in $TASKS; do
        echo "   Stopping task: $task"
        aws ecs stop-task --cluster skyfi-mcp-production-cluster --task "$task" 2>/dev/null || true
    done
    sleep 5
fi

# Delete ECS Cluster
echo "3️⃣ Deleting ECS Cluster..."
aws ecs delete-cluster --cluster skyfi-mcp-production-cluster 2>/dev/null || true

# Force delete ElastiCache replication group
echo "4️⃣ Deleting ElastiCache Replication Group..."
aws elasticache delete-replication-group \
    --replication-group-id skyfi-mcp-production-redis \
    --no-retain-primary-cluster 2>/dev/null || true

# Wait a bit for ElastiCache to start deletion
sleep 10

# Force delete RDS instance
echo "5️⃣ Deleting RDS Instance..."
aws rds delete-db-instance \
    --db-instance-identifier skyfi-mcp-production-db \
    --skip-final-snapshot \
    --delete-automated-backups 2>/dev/null || true

# Wait for DB/Redis to start deleting before removing parameter groups
echo "   Waiting 30 seconds for resources to begin deletion..."
sleep 30

# Now try to delete parameter groups
echo "6️⃣ Deleting Parameter Groups..."
aws elasticache delete-cache-parameter-group \
    --cache-parameter-group-name skyfi-mcp-production-redis7 2>/dev/null || true

aws rds delete-db-parameter-group \
    --db-parameter-group-name skyfi-mcp-production-pg15 2>/dev/null || true

# Delete subnet groups
echo "7️⃣ Deleting Subnet Groups..."
aws elasticache delete-cache-subnet-group \
    --cache-subnet-group-name skyfi-mcp-production-redis-subnet 2>/dev/null || true

aws rds delete-db-subnet-group \
    --db-subnet-group-name skyfi-mcp-production-db-subnet 2>/dev/null || true

echo ""
echo "✅ Force deletion commands completed!"
echo ""
echo "⏱️  Wait 2-5 minutes for AWS to finish deleting resources, then run:"
echo "   terraform destroy"
echo ""
echo "If terraform destroy still hangs, you can remove stuck resources from state:"
echo "   terraform state rm module.ecs.aws_ecs_cluster.main"
echo "   terraform state rm module.rds.aws_db_parameter_group.main"
echo "   terraform state rm module.elasticache.aws_elasticache_parameter_group.main"

