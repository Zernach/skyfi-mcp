# SkyFi MCP - Terraform Infrastructure

This directory contains Terraform configuration for deploying SkyFi MCP to AWS.

## Architecture Overview

The Terraform configuration creates a complete, production-ready infrastructure:

```
┌─────────────────────────────────────────────────────────────┐
│                      Internet Gateway                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│         Application Load Balancer (Public Subnets)          │
│              SSL/TLS Termination + Health Checks            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              ECS Fargate Service (Private Subnets)          │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Auto-scaling Tasks (2-10 containers)              │    │
│  │  - CPU & Memory based scaling                      │    │
│  │  - Health checks + Circuit breaker                 │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────┬───────────────────────┬─────────────────────┘
              │                       │
   ┌──────────▼─────────┐  ┌─────────▼─────────┐
   │ RDS PostgreSQL     │  │ ElastiCache Redis │
   │  (Multi-AZ)        │  │   (Multi-AZ)      │
   │  + Performance     │  │  + Encryption     │
   │    Insights        │  │  + Monitoring     │
   └────────────────────┘  └───────────────────┘
              │
   ┌──────────▼─────────┐
   │   NAT Gateway      │
   │ (Outbound traffic) │
   └────────────────────┘
```

## Modules

- **vpc**: VPC with public/private subnets, NAT Gateway, Internet Gateway
- **security-groups**: Security groups for ALB, ECS, RDS, Redis
- **secrets**: AWS Secrets Manager for API keys, JWT secret, database password
- **rds**: PostgreSQL 15 with Multi-AZ, automated backups, encryption
- **elasticache**: Redis 7 with automatic failover, encryption
- **ecr**: Docker image registry with vulnerability scanning
- **iam**: IAM roles and policies for ECS tasks
- **alb**: Application Load Balancer with SSL/TLS support
- **ecs**: ECS Fargate cluster, task definition, service with auto-scaling
- **monitoring**: CloudWatch alarms, dashboards, SNS notifications

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **Terraform** >= 1.6.0 ([Install](https://learn.hashicorp.com/tutorials/terraform/install-cli))
3. **AWS CLI** configured with credentials ([Install](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
4. **SkyFi API Key** (required)

## Quick Start

### 1. Configure AWS Credentials

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region
```

### 2. Create terraform.tfvars

Create a `terraform.tfvars` file with your configuration:

```hcl
# Required
skyfi_api_key = "your-skyfi-api-key"

# Optional (defaults shown)
aws_region    = "us-east-1"
project_name  = "skyfi-mcp"
environment   = "production"

# Database configuration
db_name     = "skyfi_mcp"
db_username = "skyfi"
# db_password will be auto-generated if not specified

# ECS configuration
ecs_task_cpu         = "512"
ecs_task_memory      = "1024"
ecs_desired_count    = 2
ecs_min_capacity     = 2
ecs_max_capacity     = 10
ecs_cpu_target_value = 70

# RDS configuration
rds_instance_class        = "db.t4g.small"
rds_allocated_storage     = 20
rds_multi_az              = true
rds_backup_retention_days = 7

# ElastiCache configuration
redis_node_type          = "cache.t4g.small"
redis_num_cache_nodes    = 2
redis_automatic_failover = true

# Monitoring
alarm_email = "your-email@example.com"

# SSL/TLS (optional)
# enable_https         = true
# ssl_certificate_arn  = "arn:aws:acm:us-east-1:123456789012:certificate/..."
```

### 3. Initialize Terraform

```bash
cd terraform
terraform init
```

### 4. Plan Infrastructure

```bash
terraform plan
```

Review the plan to ensure it creates the expected resources.

### 5. Apply Infrastructure

```bash
terraform apply
```

Type `yes` when prompted. This will take ~15-20 minutes to create all resources.

### 6. Build and Push Docker Image

After infrastructure is created, get the ECR repository URL from outputs:

```bash
# Get ECR repository URL
ECR_URL=$(terraform output -raw ecr_repository_url)

# Authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URL

# Build and push image (from project root)
cd ..
docker build -t skyfi-mcp .
docker tag skyfi-mcp:latest $ECR_URL:latest
docker push $ECR_URL:latest
```

### 7. Deploy to ECS

```bash
# Force new deployment
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --force-new-deployment \
  --region us-east-1
```

### 8. Verify Deployment

```bash
# Get ALB DNS name
ALB_DNS=$(terraform output -raw alb_dns_name)

# Test health endpoint
curl http://$ALB_DNS/health

# Monitor logs
aws logs tail $(terraform output -raw ecs_service_name | sed 's/.*\///') --follow
```

## Configuration Options

### Environment-Specific Deployments

Create multiple `.tfvars` files for different environments:

```bash
# Development
terraform apply -var-file="dev.tfvars"

# Staging
terraform apply -var-file="staging.tfvars"

# Production
terraform apply -var-file="production.tfvars"
```

Example `dev.tfvars`:

```hcl
environment               = "dev"
ecs_desired_count         = 1
ecs_min_capacity          = 1
ecs_max_capacity          = 3
rds_instance_class        = "db.t4g.micro"
rds_multi_az              = false
redis_node_type           = "cache.t4g.micro"
redis_num_cache_nodes     = 1
redis_automatic_failover  = false
```

### SSL/TLS Configuration

To enable HTTPS:

1. Request an SSL certificate in AWS Certificate Manager:
```bash
aws acm request-certificate \
  --domain-name skyfi-mcp.yourdomain.com \
  --validation-method DNS \
  --region us-east-1
```

2. Add DNS validation records to your domain

3. Update `terraform.tfvars`:
```hcl
enable_https        = true
ssl_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
```

4. Apply changes:
```bash
terraform apply
```

### Remote State Management

For team collaboration, configure remote state in S3:

1. Create S3 bucket and DynamoDB table:
```bash
# Create S3 bucket
aws s3 mb s3://skyfi-mcp-terraform-state --region us-east-1
aws s3api put-bucket-versioning \
  --bucket skyfi-mcp-terraform-state \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name skyfi-mcp-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

2. Uncomment backend configuration in `main.tf`:
```hcl
backend "s3" {
  bucket         = "skyfi-mcp-terraform-state"
  key            = "production/terraform.tfstate"
  region         = "us-east-1"
  encrypt        = true
  dynamodb_table = "skyfi-mcp-terraform-locks"
}
```

3. Initialize backend:
```bash
terraform init -migrate-state
```

## Outputs

After `terraform apply`, you'll get important outputs:

```bash
# View all outputs
terraform output

# View specific output
terraform output alb_dns_name
terraform output ecr_repository_url
```

Key outputs:
- `alb_dns_name`: URL to access your application
- `ecr_repository_url`: Docker image repository
- `ecs_cluster_name`: ECS cluster name
- `ecs_service_name`: ECS service name

## Monitoring

### CloudWatch Dashboard

View the CloudWatch dashboard:

```bash
# Get dashboard name
terraform output -raw monitoring_dashboard_name

# Open in browser (replace region if needed)
open "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:"
```

### CloudWatch Logs

```bash
# View logs
aws logs tail /ecs/skyfi-mcp-production --follow

# Search logs
aws logs filter-log-events \
  --log-group-name /ecs/skyfi-mcp-production \
  --filter-pattern "ERROR"
```

### Alarms

Configured alarms:
- High response time (> 1 second)
- High 5xx error rate (> 10 per 5 minutes)
- Unhealthy targets
- High CPU utilization (> 90%)
- High memory utilization (> 90%)
- Low task count (< 1)

Email notifications are sent to `alarm_email` if configured.

## Maintenance

### Update Application

```bash
# Build and push new image
docker build -t skyfi-mcp .
docker tag skyfi-mcp:latest $ECR_URL:latest
docker push $ECR_URL:latest

# Force deployment
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --force-new-deployment
```

### Scale Service

```bash
# Manual scaling
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --desired-count 5

# Or update terraform.tfvars and apply
```

### Database Backup

Automated backups are enabled (7-day retention). To create manual snapshot:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier skyfi-mcp-production-db \
  --db-snapshot-identifier skyfi-mcp-manual-$(date +%Y%m%d)
```

### View RDS Endpoint

```bash
# Get database connection info (sensitive)
terraform output -json | jq -r '.rds_endpoint.value'
```

## Cost Optimization

### Development Environment

For development, use smaller instances:

```hcl
# dev.tfvars
rds_instance_class        = "db.t4g.micro"
rds_multi_az              = false
redis_node_type           = "cache.t4g.micro"
redis_num_cache_nodes     = 1
redis_automatic_failover  = false
ecs_task_cpu              = "256"
ecs_task_memory           = "512"
ecs_desired_count         = 1
ecs_min_capacity          = 1
ecs_max_capacity          = 2
```

**Estimated cost**: ~$90-100/month

### Production Environment

Default configuration (recommended):

**Estimated cost**: ~$180-210/month

### Cost Reduction Tips

1. Use Savings Plans (1 or 3 year commitment)
2. Enable RDS Reserved Instances
3. Use ElastiCache Reserved Nodes
4. Monitor and adjust auto-scaling thresholds
5. Clean up old ECR images (lifecycle policy included)
6. Delete unused snapshots

## Troubleshooting

### ECS Tasks Not Starting

```bash
# Check service events
aws ecs describe-services \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --services $(terraform output -raw ecs_service_name) \
  --query 'services[0].events[:10]'

# Check task status
aws ecs list-tasks \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service-name $(terraform output -raw ecs_service_name)
```

### Database Connection Issues

```bash
# Test from ECS task
aws ecs execute-command \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --task <task-id> \
  --container skyfi-mcp \
  --interactive \
  --command "/bin/sh"
```

### Terraform State Issues

```bash
# Refresh state
terraform refresh

# Import existing resource
terraform import aws_ecs_cluster.main skyfi-mcp-production-cluster
```

## Cleanup

To destroy all infrastructure:

```bash
# Preview deletion
terraform plan -destroy

# Destroy (WARNING: This will delete all data!)
terraform destroy
```

**Note**: RDS has deletion protection enabled by default. To destroy:

1. Update `terraform.tfvars`:
```hcl
rds_deletion_protection = false
rds_skip_final_snapshot = true  # WARNING: No final backup!
```

2. Apply changes, then destroy:
```bash
terraform apply
terraform destroy
```

## Security Best Practices

✅ **Implemented**:
- All sensitive data stored in Secrets Manager
- Encryption at rest (RDS, ElastiCache, ECS)
- Encryption in transit (TLS)
- Private subnets for compute/data
- Security groups with least privilege
- VPC Flow Logs
- Container Insights enabled
- IAM roles with minimal permissions
- Multi-AZ deployment for HA

🔒 **Recommended**:
- Enable AWS WAF on ALB
- Enable GuardDuty for threat detection
- Enable CloudTrail for audit logs
- Implement AWS Backup for automated backups
- Use AWS Config for compliance monitoring
- Rotate secrets regularly
- Enable MFA on AWS account

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/deploy-aws.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Login to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build and push
        run: |
          docker build -t skyfi-mcp .
          docker tag skyfi-mcp:latest ${{ steps.ecr-login.outputs.registry }}/skyfi-mcp-production:latest
          docker push ${{ steps.ecr-login.outputs.registry }}/skyfi-mcp-production:latest
      
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster skyfi-mcp-production-cluster \
            --service skyfi-mcp-production-service \
            --force-new-deployment
```

## Support

- [AWS Documentation](https://docs.aws.amazon.com/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)

## License

MIT

