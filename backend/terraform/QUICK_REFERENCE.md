# Terraform Quick Reference

## 🚀 One-Line Deployment

```bash
cd terraform && cp terraform.tfvars.example terraform.tfvars && vi terraform.tfvars && ./deploy.sh all
```

## 📋 Essential Commands

### Deployment
```bash
./deploy.sh all        # Complete deployment
./deploy.sh init       # Initialize Terraform
./deploy.sh plan       # Preview changes
./deploy.sh apply      # Apply infrastructure
./deploy.sh build      # Build & push Docker image
./deploy.sh deploy     # Deploy to ECS
```

### Monitoring
```bash
./deploy.sh status     # Check health
./deploy.sh logs       # Stream logs
```

### Cleanup
```bash
./deploy.sh destroy    # Destroy everything
```

## 🔧 Manual Operations

### Scale Service
```bash
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --desired-count 5
```

### View Outputs
```bash
terraform output                          # All outputs
terraform output alb_dns_name            # ALB URL
terraform output ecr_repository_url      # ECR repo
```

### Update Application
```bash
# 1. Build and push new image
./deploy.sh build

# 2. Deploy
./deploy.sh deploy

# 3. Monitor
./deploy.sh logs
```

### Database Operations
```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier $(terraform output -raw ecs_cluster_name | sed 's/-cluster/-db/') \
  --db-snapshot-identifier manual-$(date +%Y%m%d)

# List snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier $(terraform output -raw ecs_cluster_name | sed 's/-cluster/-db/')
```

### Logs
```bash
# Stream logs
aws logs tail /ecs/skyfi-mcp-production --follow

# Search logs
aws logs filter-log-events \
  --log-group-name /ecs/skyfi-mcp-production \
  --filter-pattern "ERROR"
```

### Debug ECS Task
```bash
# List tasks
aws ecs list-tasks \
  --cluster $(terraform output -raw ecs_cluster_name)

# Connect to task
aws ecs execute-command \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --task <task-id> \
  --container skyfi-mcp \
  --interactive \
  --command "/bin/sh"
```

## 📊 Cost Estimates

| Environment | Monthly Cost |
|-------------|--------------|
| Development | ~$90-100 |
| Production  | ~$180-210 |

## 🏗️ Infrastructure Components

| Component | Resource | Configuration |
|-----------|----------|---------------|
| Compute | ECS Fargate | 2-10 tasks, auto-scaling |
| Database | RDS PostgreSQL 15 | Multi-AZ, t4g.small |
| Cache | ElastiCache Redis 7 | Multi-node, t4g.small |
| Network | VPC + ALB | 2 AZs, public/private subnets |
| Storage | ECR | Image scanning enabled |

## 🔐 Security Checklist

- [x] Encryption at rest (RDS, Redis, ECS)
- [x] Encryption in transit (TLS)
- [x] Private subnets for compute/data
- [x] Secrets in AWS Secrets Manager
- [x] Security groups with least privilege
- [x] VPC Flow Logs enabled
- [x] Multi-AZ deployment
- [ ] AWS WAF (optional)
- [ ] GuardDuty (optional)
- [ ] CloudTrail (optional)

## 📈 Monitoring

### CloudWatch Dashboard
```bash
# Get dashboard URL
echo "https://console.aws.amazon.com/cloudwatch/home?region=$(aws configure get region)#dashboards:name=$(terraform output -raw monitoring_dashboard_name)"
```

### Alarms Configured
- High response time (> 1s)
- High 5xx errors (> 10/5min)
- Unhealthy targets
- High CPU (> 90%)
- High memory (> 90%)
- Low task count (< 1)

## 🔄 Common Updates

### Change Instance Sizes
```hcl
# terraform.tfvars
rds_instance_class = "db.t4g.medium"
redis_node_type    = "cache.t4g.medium"
```
```bash
terraform apply
```

### Change Auto-Scaling
```hcl
# terraform.tfvars
ecs_min_capacity = 3
ecs_max_capacity = 15
ecs_cpu_target_value = 60
```
```bash
terraform apply
```

### Enable HTTPS
```hcl
# terraform.tfvars
enable_https = true
ssl_certificate_arn = "arn:aws:acm:..."
```
```bash
terraform apply
```

## 🐛 Troubleshooting

### Tasks Not Starting
```bash
# Check service events
aws ecs describe-services \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --services $(terraform output -raw ecs_service_name) \
  --query 'services[0].events[:5]'
```

### Database Connection Failed
```bash
# Check security group
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*rds*"

# Test from ECS task
aws ecs execute-command --cluster <cluster> --task <task-id> \
  --container skyfi-mcp --interactive \
  --command "nc -zv $POSTGRES_HOST 5432"
```

### High Costs
```bash
# Check running resources
terraform state list

# Review cost by service
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '7 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

## 📞 Support

- **AWS Console**: https://console.aws.amazon.com
- **Terraform Docs**: https://registry.terraform.io/providers/hashicorp/aws
- **Project Issues**: [GitHub Issues]

## 🔗 Quick Links

- [Full Documentation](README.md)
- [Deployment Checklist](DEPLOYMENT_CHECKLIST.md)
- [Infrastructure Summary](TERRAFORM_SUMMARY.md)
- [AWS Deployment Guide](../docs/AWS_DEPLOYMENT.md)

---

**Tip**: Bookmark this page for quick reference during operations! 🚀

