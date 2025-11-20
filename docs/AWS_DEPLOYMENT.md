# AWS Deployment Guide - SkyFi MCP

## Overview

This guide covers deploying SkyFi MCP to AWS using ECS Fargate, RDS PostgreSQL, and ElastiCache Redis.

## Prerequisites

- AWS CLI installed and configured
- AWS account with appropriate permissions
- Docker installed locally
- Node.js 20+ installed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Internet Gateway                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  Application Load Balancer                   │
│              (Public Subnets: us-east-1a, 1b)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   ECS Fargate Cluster                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         SkyFi MCP Service (Auto-scaling)            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │  Task 1  │  │  Task 2  │  │  Task 3  │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
│              (Private Subnets: us-east-1a, 1b)              │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
      ┌───────────▼─────────┐   ┌────────▼──────────┐
      │  RDS PostgreSQL     │   │ ElastiCache Redis │
      │    (Multi-AZ)       │   │   (Multi-AZ)      │
      └─────────────────────┘   └───────────────────┘
                  │
      ┌───────────▼─────────┐
      │    NAT Gateway      │
      │  (Outbound traffic) │
      └─────────────────────┘
                  │
         (SkyFi API, OSM API)
```

## Step-by-Step Deployment

### 1. Set Up AWS Infrastructure

#### 1.1 Create VPC and Subnets

```bash
# Create VPC
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=skyfi-mcp-vpc}]'

# Note the VPC ID from output
export VPC_ID=<vpc-id>

# Create Internet Gateway
aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=skyfi-mcp-igw}]'

export IGW_ID=<igw-id>

# Attach Internet Gateway
aws ec2 attach-internet-gateway \
  --vpc-id $VPC_ID \
  --internet-gateway-id $IGW_ID

# Create Public Subnets (for ALB)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=skyfi-mcp-public-1a}]'

aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=skyfi-mcp-public-1b}]'

# Create Private Subnets (for ECS, RDS, Redis)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.11.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=skyfi-mcp-private-1a}]'

aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.12.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=skyfi-mcp-private-1b}]'

# Save subnet IDs
export PUBLIC_SUBNET_1A=<subnet-id>
export PUBLIC_SUBNET_1B=<subnet-id>
export PRIVATE_SUBNET_1A=<subnet-id>
export PRIVATE_SUBNET_1B=<subnet-id>
```

#### 1.2 Create NAT Gateway

```bash
# Allocate Elastic IP
aws ec2 allocate-address --domain vpc

export EIP_ALLOC_ID=<allocation-id>

# Create NAT Gateway in public subnet
aws ec2 create-nat-gateway \
  --subnet-id $PUBLIC_SUBNET_1A \
  --allocation-id $EIP_ALLOC_ID \
  --tag-specifications 'ResourceType=natgateway,Tags=[{Key=Name,Value=skyfi-mcp-nat}]'

export NAT_GW_ID=<nat-gateway-id>

# Wait for NAT Gateway to be available (takes 1-2 minutes)
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_GW_ID
```

#### 1.3 Configure Route Tables

```bash
# Create route table for public subnets
aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=skyfi-mcp-public-rt}]'

export PUBLIC_RT_ID=<route-table-id>

# Add route to Internet Gateway
aws ec2 create-route \
  --route-table-id $PUBLIC_RT_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id $IGW_ID

# Associate public subnets
aws ec2 associate-route-table --subnet-id $PUBLIC_SUBNET_1A --route-table-id $PUBLIC_RT_ID
aws ec2 associate-route-table --subnet-id $PUBLIC_SUBNET_1B --route-table-id $PUBLIC_RT_ID

# Create route table for private subnets
aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=skyfi-mcp-private-rt}]'

export PRIVATE_RT_ID=<route-table-id>

# Add route to NAT Gateway
aws ec2 create-route \
  --route-table-id $PRIVATE_RT_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id $NAT_GW_ID

# Associate private subnets
aws ec2 associate-route-table --subnet-id $PRIVATE_SUBNET_1A --route-table-id $PRIVATE_RT_ID
aws ec2 associate-route-table --subnet-id $PRIVATE_SUBNET_1B --route-table-id $PRIVATE_RT_ID
```

### 2. Create Security Groups

```bash
# ALB Security Group (allow HTTP/HTTPS from internet)
aws ec2 create-security-group \
  --group-name skyfi-mcp-alb-sg \
  --description "Security group for SkyFi MCP ALB" \
  --vpc-id $VPC_ID

export ALB_SG_ID=<security-group-id>

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# ECS Tasks Security Group (allow traffic from ALB)
aws ec2 create-security-group \
  --group-name skyfi-mcp-ecs-sg \
  --description "Security group for SkyFi MCP ECS tasks" \
  --vpc-id $VPC_ID

export ECS_SG_ID=<security-group-id>

aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG_ID \
  --protocol tcp \
  --port 3000 \
  --source-group $ALB_SG_ID

# RDS Security Group (allow PostgreSQL from ECS)
aws ec2 create-security-group \
  --group-name skyfi-mcp-rds-sg \
  --description "Security group for SkyFi MCP RDS" \
  --vpc-id $VPC_ID

export RDS_SG_ID=<security-group-id>

aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG_ID \
  --protocol tcp \
  --port 5432 \
  --source-group $ECS_SG_ID

# ElastiCache Security Group (allow Redis from ECS)
aws ec2 create-security-group \
  --group-name skyfi-mcp-redis-sg \
  --description "Security group for SkyFi MCP Redis" \
  --vpc-id $VPC_ID

export REDIS_SG_ID=<security-group-id>

aws ec2 authorize-security-group-ingress \
  --group-id $REDIS_SG_ID \
  --protocol tcp \
  --port 6379 \
  --source-group $ECS_SG_ID
```

### 3. Create RDS PostgreSQL Database

```bash
# Create DB Subnet Group
aws rds create-db-subnet-group \
  --db-subnet-group-name skyfi-mcp-db-subnet \
  --db-subnet-group-description "Subnet group for SkyFi MCP database" \
  --subnet-ids $PRIVATE_SUBNET_1A $PRIVATE_SUBNET_1B

# Generate a strong password
export DB_PASSWORD=$(openssl rand -base64 32)

# Create RDS Instance
aws rds create-db-instance \
  --db-instance-identifier skyfi-mcp-db \
  --db-instance-class db.t4g.small \
  --engine postgres \
  --engine-version 15.5 \
  --master-username skyfi \
  --master-user-password "$DB_PASSWORD" \
  --allocated-storage 20 \
  --storage-type gp3 \
  --vpc-security-group-ids $RDS_SG_ID \
  --db-subnet-group-name skyfi-mcp-db-subnet \
  --backup-retention-period 7 \
  --multi-az \
  --no-publicly-accessible \
  --db-name skyfi_mcp

# Wait for RDS to be available (takes 5-10 minutes)
aws rds wait db-instance-available --db-instance-identifier skyfi-mcp-db

# Get RDS endpoint
aws rds describe-db-instances \
  --db-instance-identifier skyfi-mcp-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text

export DB_HOST=<rds-endpoint>
```

### 4. Create ElastiCache Redis Cluster

```bash
# Create Redis Subnet Group
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name skyfi-mcp-redis-subnet \
  --cache-subnet-group-description "Subnet group for SkyFi MCP Redis" \
  --subnet-ids $PRIVATE_SUBNET_1A $PRIVATE_SUBNET_1B

# Create Redis Cluster
aws elasticache create-replication-group \
  --replication-group-id skyfi-mcp-redis \
  --replication-group-description "Redis cluster for SkyFi MCP" \
  --engine redis \
  --cache-node-type cache.t4g.small \
  --num-cache-clusters 2 \
  --automatic-failover-enabled \
  --cache-subnet-group-name skyfi-mcp-redis-subnet \
  --security-group-ids $REDIS_SG_ID

# Wait for Redis to be available (takes 3-5 minutes)
aws elasticache wait replication-group-available --replication-group-id skyfi-mcp-redis

# Get Redis endpoint
aws elasticache describe-replication-groups \
  --replication-group-id skyfi-mcp-redis \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' \
  --output text

export REDIS_HOST=<redis-endpoint>
```

### 5. Store Secrets in AWS Secrets Manager

```bash
# Generate JWT secret
export JWT_SECRET=$(openssl rand -base64 64)

# Store SkyFi API Key
aws secretsmanager create-secret \
  --name skyfi-mcp/skyfi-api-key \
  --description "SkyFi API Key for MCP server" \
  --secret-string "$SKYFI_API_KEY"

# Store JWT Secret
aws secretsmanager create-secret \
  --name skyfi-mcp/jwt-secret \
  --description "JWT secret for SkyFi MCP" \
  --secret-string "$JWT_SECRET"

# Store Database Password
aws secretsmanager create-secret \
  --name skyfi-mcp/db-password \
  --description "PostgreSQL password for SkyFi MCP" \
  --secret-string "$DB_PASSWORD"

# Get secret ARNs for ECS task definition
aws secretsmanager describe-secret --secret-id skyfi-mcp/skyfi-api-key --query ARN --output text
aws secretsmanager describe-secret --secret-id skyfi-mcp/jwt-secret --query ARN --output text
aws secretsmanager describe-secret --secret-id skyfi-mcp/db-password --query ARN --output text
```

### 6. Create ECR Repository and Push Image

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name skyfi-mcp \
  --image-scanning-configuration scanOnPush=true

export ECR_REPO_URI=<repository-uri>

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_REPO_URI

# Build and push image
docker build -t skyfi-mcp .
docker tag skyfi-mcp:latest $ECR_REPO_URI:latest
docker push $ECR_REPO_URI:latest
```

### 7. Create ECS Cluster and Task Definition

```bash
# Create ECS Cluster
aws ecs create-cluster --cluster-name skyfi-mcp-cluster

# Create IAM role for ECS task execution
# (This requires creating a trust policy and attaching policies - see AWS IAM documentation)

# Create task definition (see task-definition.json below)
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

**task-definition.json:**

```json
{
  "family": "skyfi-mcp",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "skyfi-mcp",
      "image": "<ecr-repo-uri>:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        },
        {
          "name": "POSTGRES_HOST",
          "value": "<rds-endpoint>"
        },
        {
          "name": "POSTGRES_PORT",
          "value": "5432"
        },
        {
          "name": "POSTGRES_DB",
          "value": "skyfi_mcp"
        },
        {
          "name": "POSTGRES_USER",
          "value": "skyfi"
        },
        {
          "name": "REDIS_HOST",
          "value": "<redis-endpoint>"
        },
        {
          "name": "REDIS_PORT",
          "value": "6379"
        }
      ],
      "secrets": [
        {
          "name": "SKYFI_API_KEY",
          "valueFrom": "<skyfi-api-key-secret-arn>"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "<jwt-secret-arn>"
        },
        {
          "name": "POSTGRES_PASSWORD",
          "valueFrom": "<db-password-secret-arn>"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/skyfi-mcp",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -q --spider http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### 8. Create Application Load Balancer

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name skyfi-mcp-alb \
  --subnets $PUBLIC_SUBNET_1A $PUBLIC_SUBNET_1B \
  --security-groups $ALB_SG_ID \
  --scheme internet-facing \
  --type application

export ALB_ARN=<load-balancer-arn>

# Create Target Group
aws elbv2 create-target-group \
  --name skyfi-mcp-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-enabled \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3

export TG_ARN=<target-group-arn>

# Create Listener (HTTP - redirect to HTTPS in production)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

### 9. Create ECS Service

```bash
# Create ECS Service
aws ecs create-service \
  --cluster skyfi-mcp-cluster \
  --service-name skyfi-mcp-service \
  --task-definition skyfi-mcp \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[$PRIVATE_SUBNET_1A,$PRIVATE_SUBNET_1B],
    securityGroups=[$ECS_SG_ID],
    assignPublicIp=DISABLED
  }" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=skyfi-mcp,containerPort=3000" \
  --health-check-grace-period-seconds 60

# Enable auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/skyfi-mcp-cluster/skyfi-mcp-service \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy (target 70% CPU utilization)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/skyfi-mcp-cluster/skyfi-mcp-service \
  --policy-name cpu-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

**scaling-policy.json:**

```json
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleInCooldown": 300,
  "ScaleOutCooldown": 60
}
```

### 10. Configure SSL/TLS (Production)

```bash
# Request SSL certificate via ACM
aws acm request-certificate \
  --domain-name skyfi-mcp.yourdomain.com \
  --validation-method DNS \
  --subject-alternative-names "*.skyfi-mcp.yourdomain.com"

# Add DNS validation records to Route 53
# (Follow ACM console instructions)

# Wait for certificate validation
export CERT_ARN=<certificate-arn>

# Create HTTPS listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Modify HTTP listener to redirect to HTTPS
aws elbv2 modify-listener \
  --listener-arn <http-listener-arn> \
  --default-actions Type=redirect,RedirectConfig="{
    Protocol=HTTPS,
    Port=443,
    StatusCode=HTTP_301
  }"
```

## Monitoring and Logs

### CloudWatch Logs

```bash
# Create log group
aws logs create-log-group --log-group-name /ecs/skyfi-mcp

# Set retention policy (30 days)
aws logs put-retention-policy \
  --log-group-name /ecs/skyfi-mcp \
  --retention-in-days 30

# View logs
aws logs tail /ecs/skyfi-mcp --follow
```

### CloudWatch Alarms

```bash
# Create alarm for high error rate
aws cloudwatch put-metric-alarm \
  --alarm-name skyfi-mcp-high-error-rate \
  --alarm-description "Alert when error rate exceeds 5%" \
  --metric-name TargetResponseTime \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

## Maintenance

### Update Application

```bash
# Build and push new image
docker build -t skyfi-mcp .
docker tag skyfi-mcp:latest $ECR_REPO_URI:latest
docker push $ECR_REPO_URI:latest

# Force new deployment
aws ecs update-service \
  --cluster skyfi-mcp-cluster \
  --service skyfi-mcp-service \
  --force-new-deployment
```

### Database Migrations

```bash
# Connect to ECS task and run migrations
aws ecs execute-command \
  --cluster skyfi-mcp-cluster \
  --task <task-id> \
  --container skyfi-mcp \
  --interactive \
  --command "/bin/sh"

# Inside container:
# npm run migrate
```

### Backup and Restore

```bash
# RDS automated backups are already enabled (7 days retention)

# Manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier skyfi-mcp-db \
  --db-snapshot-identifier skyfi-mcp-manual-$(date +%Y%m%d)

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier skyfi-mcp-db-restored \
  --db-snapshot-identifier skyfi-mcp-manual-20250118
```

## Cost Optimization

1. **Use Savings Plans:** 1-year or 3-year commitment for Fargate/RDS
2. **Right-size resources:** Monitor CPU/memory usage and adjust
3. **Use Spot instances:** For non-critical workloads
4. **Enable CloudWatch detailed monitoring:** Only when needed
5. **Clean up unused resources:** Delete old snapshots, unused IPs

## Security Best Practices

1. **Enable VPC Flow Logs**
2. **Enable AWS CloudTrail** for API audit logs
3. **Use AWS WAF** on ALB for DDoS protection
4. **Enable GuardDuty** for threat detection
5. **Regular security patching** via automated ECS task updates
6. **Rotate secrets** regularly via Secrets Manager
7. **Enable MFA** on AWS account
8. **Use IAM roles** instead of access keys

## Troubleshooting

### ECS Tasks Failing to Start

```bash
# Check ECS service events
aws ecs describe-services \
  --cluster skyfi-mcp-cluster \
  --services skyfi-mcp-service \
  --query 'services[0].events[:10]'

# Check CloudWatch logs
aws logs tail /ecs/skyfi-mcp --follow

# Check task stopped reason
aws ecs describe-tasks \
  --cluster skyfi-mcp-cluster \
  --tasks <task-id> \
  --query 'tasks[0].stoppedReason'
```

### Database Connection Issues

```bash
# Test connectivity from ECS task
aws ecs execute-command \
  --cluster skyfi-mcp-cluster \
  --task <task-id> \
  --container skyfi-mcp \
  --interactive \
  --command "/bin/sh"

# Inside container:
# nc -zv $POSTGRES_HOST 5432
# psql -h $POSTGRES_HOST -U skyfi -d skyfi_mcp
```

### High Latency

```bash
# Check ALB target health
aws elbv2 describe-target-health \
  --target-group-arn $TG_ARN

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=<alb-name> \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

## Additional Resources

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS RDS PostgreSQL Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

