#!/bin/bash

# Import existing AWS resources into Terraform state
# This script imports resources that already exist in AWS

set -e

echo "🔄 Importing existing AWS resources into Terraform state..."

# ALB Resources
echo "Importing ALB..."
terraform import module.alb.aws_lb.main skyfi-mcp-production-alb || true
terraform import module.alb.aws_lb_target_group.main \
  $(aws elbv2 describe-target-groups --names skyfi-mcp-production-tg --query 'TargetGroups[0].TargetGroupArn' --output text) || true

# ECR Repository
echo "Importing ECR Repository..."
terraform import module.ecr.aws_ecr_repository.main skyfi-mcp-production || true

# CloudWatch Log Groups
echo "Importing CloudWatch Log Groups..."
terraform import module.ecs.aws_cloudwatch_log_group.main /ecs/skyfi-mcp-production || true
terraform import module.elasticache.aws_cloudwatch_log_group.redis_slow_log /aws/elasticache/skyfi-mcp-production/redis/slow-log || true
terraform import module.elasticache.aws_cloudwatch_log_group.redis_engine_log /aws/elasticache/skyfi-mcp-production/redis/engine-log || true
terraform import module.vpc.aws_cloudwatch_log_group.vpc_flow_log /aws/vpc/skyfi-mcp-production || true

# ElastiCache Resources
echo "Importing ElastiCache Resources..."
terraform import module.elasticache.aws_elasticache_subnet_group.main skyfi-mcp-production-redis-subnet || true
terraform import module.elasticache.aws_elasticache_parameter_group.main skyfi-mcp-production-redis7 || true

# IAM Roles
echo "Importing IAM Roles..."
terraform import module.iam.aws_iam_role.ecs_task_execution skyfi-mcp-production-ecs-task-execution-role || true
terraform import module.iam.aws_iam_role.ecs_task skyfi-mcp-production-ecs-task-role || true
terraform import module.iam.aws_iam_role.ecs_autoscaling skyfi-mcp-production-ecs-autoscaling-role || true
terraform import module.rds.aws_iam_role.rds_monitoring skyfi-mcp-production-rds-monitoring-role || true
terraform import module.vpc.aws_iam_role.vpc_flow_log skyfi-mcp-production-vpc-flow-log-role || true

# RDS Resources
echo "Importing RDS Resources..."
terraform import module.rds.aws_db_subnet_group.main skyfi-mcp-production-db-subnet || true
terraform import module.rds.aws_db_parameter_group.main skyfi-mcp-production-pg15 || true

# Secrets Manager Secrets
echo "Importing Secrets Manager Secrets..."
terraform import module.secrets.aws_secretsmanager_secret.skyfi_api_key \
  $(aws secretsmanager describe-secret --secret-id skyfi-mcp/production/skyfi-api-key --query 'ARN' --output text) || true
terraform import module.secrets.aws_secretsmanager_secret.jwt_secret \
  $(aws secretsmanager describe-secret --secret-id skyfi-mcp/production/jwt-secret --query 'ARN' --output text) || true
terraform import module.secrets.aws_secretsmanager_secret.db_password \
  $(aws secretsmanager describe-secret --secret-id skyfi-mcp/production/db-password --query 'ARN' --output text) || true

echo "✅ Import complete!"
echo ""
echo "Now run 'terraform plan' to verify the state is synchronized."

