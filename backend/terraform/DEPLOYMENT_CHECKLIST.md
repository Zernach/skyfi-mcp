# AWS Deployment Checklist

Use this checklist to ensure a successful deployment of SkyFi MCP to AWS.

## Pre-Deployment

### Prerequisites

- [ ] AWS account created and active
- [ ] AWS CLI installed and configured (`aws --version`)
- [ ] Terraform installed >= 1.6.0 (`terraform --version`)
- [ ] Docker installed (`docker --version`)
- [ ] SkyFi API key obtained
- [ ] AWS credentials configured (`aws sts get-caller-identity`)

### Configuration

- [ ] Created `terraform.tfvars` from `terraform.tfvars.example`
- [ ] Set `skyfi_api_key` in `terraform.tfvars`
- [ ] Configured `aws_region` (default: us-east-1)
- [ ] Configured `environment` (dev, staging, production)
- [ ] Set `alarm_email` for CloudWatch notifications
- [ ] Reviewed resource sizes (RDS, Redis, ECS) for your environment
- [ ] (Optional) Configured SSL certificate ARN for HTTPS

### Cost Review

- [ ] Reviewed estimated costs (~$90-100/month for dev, ~$180-210/month for prod)
- [ ] Confirmed budget approval for ongoing infrastructure costs
- [ ] Set up AWS Cost Alerts (recommended)

## Deployment Phase

### 1. Initialize Terraform

```bash
cd terraform
terraform init
```

- [ ] Terraform initialized successfully
- [ ] Required providers downloaded
- [ ] Backend configured (if using remote state)

### 2. Plan Infrastructure

```bash
terraform plan
```

- [ ] Plan completed without errors
- [ ] Reviewed resources to be created
- [ ] Verified no unexpected changes
- [ ] Estimated costs reviewed in plan output

### 3. Apply Infrastructure

```bash
terraform apply
```

**Expected Duration: 15-20 minutes**

- [ ] VPC and networking created
- [ ] Security groups configured
- [ ] RDS PostgreSQL instance available
- [ ] ElastiCache Redis cluster available
- [ ] ECR repository created
- [ ] IAM roles and policies created
- [ ] Application Load Balancer deployed
- [ ] ECS cluster created
- [ ] ECS service created (no tasks running yet)
- [ ] CloudWatch log groups created
- [ ] Secrets stored in Secrets Manager
- [ ] All outputs displayed successfully

### 4. Build and Push Docker Image

```bash
# Get ECR repository URL
ECR_URL=$(terraform output -raw ecr_repository_url)

# Authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URL

# Build and push (from project root)
cd ..
docker build -t skyfi-mcp .
docker tag skyfi-mcp:latest $ECR_URL:latest
docker push $ECR_URL:latest
```

- [ ] Docker image built successfully
- [ ] Authenticated with ECR
- [ ] Image tagged with latest
- [ ] Image pushed to ECR
- [ ] Image scan completed (check ECR console)

### 5. Deploy Application

```bash
cd terraform
./deploy.sh deploy
```

- [ ] ECS service deployment triggered
- [ ] Tasks starting successfully
- [ ] Health checks passing
- [ ] Tasks registered with target group

## Post-Deployment Verification

### Application Health

```bash
# Get ALB DNS name
ALB_DNS=$(terraform output -raw alb_dns_name)

# Test health endpoint
curl http://$ALB_DNS/health
```

- [ ] Health endpoint returns 200 OK
- [ ] Response includes status: "healthy"
- [ ] Response time acceptable (< 500ms)

### Service Status

```bash
# Check ECS service
aws ecs describe-services \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --services $(terraform output -raw ecs_service_name) \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'
```

- [ ] Service status is "ACTIVE"
- [ ] Running count matches desired count
- [ ] All tasks healthy in target group

### Logs Verification

```bash
# View logs
./deploy.sh logs
```

- [ ] Application logs streaming successfully
- [ ] No error messages in logs
- [ ] Startup messages look normal
- [ ] Database connection successful
- [ ] Redis connection successful

### Database Verification

```bash
# Get database endpoint
terraform output rds_endpoint
```

- [ ] RDS instance status is "available"
- [ ] Multi-AZ configured (if production)
- [ ] Automated backups enabled
- [ ] Encryption at rest enabled

### Monitoring Setup

- [ ] CloudWatch dashboard created
- [ ] Alarms configured
- [ ] SNS topic created for alerts
- [ ] Email subscription confirmed (check email for confirmation)

### Security Verification

- [ ] Security groups properly configured
- [ ] No unnecessary ports open
- [ ] RDS not publicly accessible
- [ ] ElastiCache not publicly accessible
- [ ] ECS tasks in private subnets
- [ ] Secrets stored in Secrets Manager (not in code)
- [ ] VPC Flow Logs enabled

## Performance Testing

### Load Testing

- [ ] Application handles expected load
- [ ] Response times acceptable under load
- [ ] Auto-scaling triggers appropriately
- [ ] No memory leaks observed
- [ ] Database performance acceptable

### Scaling Verification

```bash
# Manually scale to test
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --desired-count 5
```

- [ ] Service scales up successfully
- [ ] All new tasks become healthy
- [ ] Load balancer distributes traffic
- [ ] No service interruption during scaling

### Auto-Scaling Test

- [ ] Generate load to trigger CPU threshold
- [ ] Auto-scaling triggers successfully
- [ ] Tasks scale up to meet demand
- [ ] Tasks scale down after cooldown period

## Documentation and Access

### Documentation

- [ ] Architecture diagram updated (if modified)
- [ ] Deployment documentation complete
- [ ] Runbooks created for common issues
- [ ] Secrets documented (in secure location, not in repo)

### Access and Credentials

- [ ] IAM users created for team members (if needed)
- [ ] MFA enabled on root account
- [ ] Access keys rotated (if using)
- [ ] Database credentials secured
- [ ] API keys secured in Secrets Manager

### Monitoring and Alerts

- [ ] CloudWatch dashboard shared with team
- [ ] Alert email distribution list configured
- [ ] Escalation procedures documented
- [ ] On-call rotation established (if applicable)

## Optional Production Enhancements

### DNS and SSL

- [ ] Domain registered or available
- [ ] SSL certificate requested in ACM
- [ ] DNS records created (Route 53 or other)
- [ ] SSL certificate validated
- [ ] HTTPS listener enabled
- [ ] HTTP to HTTPS redirect configured

### Backup and Disaster Recovery

- [ ] RDS automated backups verified
- [ ] Manual snapshot created
- [ ] Backup retention policy confirmed
- [ ] Disaster recovery plan documented
- [ ] Recovery time objective (RTO) defined
- [ ] Recovery point objective (RPO) defined

### Additional Security

- [ ] AWS WAF configured on ALB
- [ ] GuardDuty enabled
- [ ] CloudTrail logging enabled
- [ ] AWS Config compliance rules enabled
- [ ] Security Hub enabled
- [ ] Secrets rotation policy configured

### CI/CD Integration

- [ ] GitHub Actions workflow configured
- [ ] Automated deployments tested
- [ ] Rollback procedures tested
- [ ] Blue/green deployment strategy (if needed)

## Post-Launch

### Immediate (Day 1)

- [ ] Monitor logs for first 24 hours
- [ ] Verify no unexpected errors
- [ ] Confirm metrics in normal range
- [ ] Test all critical API endpoints

### Short Term (Week 1)

- [ ] Review cost actuals vs estimates
- [ ] Adjust auto-scaling thresholds if needed
- [ ] Optimize resource allocations
- [ ] Address any performance issues

### Ongoing

- [ ] Weekly log review
- [ ] Monthly cost review
- [ ] Quarterly security audit
- [ ] Regular dependency updates
- [ ] Terraform state backup verification

## Rollback Plan

If deployment fails or issues are found:

```bash
# Option 1: Roll back to previous task definition
aws ecs update-service \
  --cluster <cluster-name> \
  --service <service-name> \
  --task-definition <previous-task-definition-arn>

# Option 2: Destroy infrastructure (nuclear option)
cd terraform
terraform destroy
```

- [ ] Rollback plan tested
- [ ] Previous infrastructure documented
- [ ] Downtime communication plan ready

## Support Contacts

- AWS Support: [AWS Console](https://console.aws.amazon.com/support)
- SkyFi Support: [Contact Info]
- Team Lead: [Contact Info]
- On-Call: [Contact Info]

## Sign-Off

- [ ] Technical lead approval
- [ ] Security review completed
- [ ] Compliance requirements met
- [ ] Stakeholders notified of deployment
- [ ] Post-deployment report created

---

**Deployment Date:** _________________

**Deployed By:** _________________

**Reviewed By:** _________________

**Notes:**

_________________________________________________________________________________

_________________________________________________________________________________

_________________________________________________________________________________

