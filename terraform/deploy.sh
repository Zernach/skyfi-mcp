#!/bin/bash
set -e

# SkyFi MCP Terraform Deployment Script
# This script helps deploy the infrastructure and application to AWS

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "======================================"
echo "SkyFi MCP - AWS Deployment"
echo "======================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform not found. Please install Terraform first."
    echo "   Visit: https://learn.hashicorp.com/tutorials/terraform/install-cli"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI first."
    echo "   Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

echo "✅ All prerequisites installed"
echo ""

# Check if terraform.tfvars exists
if [ ! -f "$SCRIPT_DIR/terraform.tfvars" ]; then
    echo "❌ terraform.tfvars not found!"
    echo "   Please create terraform.tfvars from terraform.tfvars.example:"
    echo "   cd terraform && cp terraform.tfvars.example terraform.tfvars"
    echo "   Then edit terraform.tfvars with your configuration."
    exit 1
fi

# Check AWS credentials
echo "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured or invalid."
    echo "   Run: aws configure"
    exit 1
fi

AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
echo "✅ AWS Account: $AWS_ACCOUNT"
echo "✅ AWS Region: $AWS_REGION"
echo ""

# Function to get Terraform region (from tfvars or default)
get_terraform_region() {
    cd "$SCRIPT_DIR"

    if [ -f "terraform.tfvars" ]; then
        TF_REGION=$(awk -F= '/^aws_region/ {
            gsub(/^[ 	]+|[ 	]+$/, "", $2);
            gsub(/"/, "", $2);
            if ($2 != "") { print $2; exit }
        }' terraform.tfvars)
        TF_REGION=$(printf '%s' "$TF_REGION" | tr -d '[:space:]' | tr -d '"')
        if [ -n "$TF_REGION" ]; then
            echo "$TF_REGION"
            return
        fi
    fi

    TF_REGION=$(terraform output -raw aws_region 2>/dev/null || true)
    TF_REGION=$(printf '%s' "$TF_REGION" | tr -d '[:space:]' | tr -d '"')
    if [ -n "$TF_REGION" ]; then
        echo "$TF_REGION"
        return
    fi

    ECR_URL=$(terraform output -raw ecr_repository_url 2>/dev/null || true)
    if [ -n "$ECR_URL" ]; then
        TF_REGION=$(echo "$ECR_URL" | sed -E 's/.*\.dkr\.ecr\.([^.]+)\.amazonaws\.com.*/\1/')
        TF_REGION=$(printf '%s' "$TF_REGION" | tr -d '[:space:]' | tr -d '"')
        if [ -n "$TF_REGION" ] && [ "$TF_REGION" != "$ECR_URL" ]; then
            echo "$TF_REGION"
            return
        fi
    fi

    echo "us-east-1"
}


# Parse command line arguments
ACTION="${1:-all}"

case $ACTION in
    "init")
        echo "Initializing Terraform..."
        cd "$SCRIPT_DIR"
        terraform init
        echo ""
        echo "✅ Terraform initialized successfully!"
        ;;
        
    "plan")
        echo "Planning infrastructure..."
        cd "$SCRIPT_DIR"
        terraform plan
        ;;
        
    "apply")
        echo "Applying infrastructure..."
        cd "$SCRIPT_DIR"
        if ! terraform apply; then
            echo ""
            echo "❌ Terraform apply failed!"
            exit 1
        fi
        echo ""
        echo "✅ Infrastructure deployed successfully!"
        ;;
        
    "build")
        echo "Building and pushing Docker image..."
        cd "$SCRIPT_DIR"
        
        # Get ECR repository URL
        ECR_URL=$(terraform output -raw ecr_repository_url 2>/dev/null || echo "")
        
        if [ -z "$ECR_URL" ]; then
            echo "❌ ECR repository not found. Please run 'terraform apply' first."
            exit 1
        fi
        
        echo "ECR Repository: $ECR_URL"
        
        # Extract region from ECR URL (format: account.dkr.ecr.region.amazonaws.com/repo)
        # Use sed to extract region (works on both GNU and BSD sed)
        ECR_REGION=$(echo "$ECR_URL" | sed -E 's/.*\.dkr\.ecr\.([^.]+)\.amazonaws\.com.*/\1/')
        
        # Verify extraction worked (if sed failed, ECR_REGION will equal ECR_URL)
        if [ -z "$ECR_REGION" ] || [ "$ECR_REGION" = "$ECR_URL" ]; then
            # Fallback: default to us-east-1 (where infrastructure is deployed)
            echo "⚠️  Could not extract region from ECR URL, defaulting to us-east-1"
            ECR_REGION="us-east-1"
        fi
        
        echo "ECR Region: $ECR_REGION"
        
        # Extract ECR domain (without repository name) for docker login
        ECR_DOMAIN=$(echo "$ECR_URL" | sed -E 's|/.*||')
        
        # Login to ECR
        echo "Logging into ECR..."
        aws ecr get-login-password --region "$ECR_REGION" | \
            docker login --username AWS --password-stdin "$ECR_DOMAIN"
        
        # Build image
        echo "Building Docker image..."
        cd "$PROJECT_ROOT"
        docker build -t skyfi-mcp .
        
        # Tag and push
        echo "Tagging and pushing image..."
        docker tag skyfi-mcp:latest "$ECR_URL:latest"
        docker push "$ECR_URL:latest"
        
        echo ""
        echo "✅ Docker image built and pushed successfully!"
        ;;
        
    "deploy")
        echo "Deploying to ECS..."
        cd "$SCRIPT_DIR"
        
        CLUSTER_NAME=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "")
        SERVICE_NAME=$(terraform output -raw ecs_service_name 2>/dev/null || echo "")
        
        if [ -z "$CLUSTER_NAME" ] || [ -z "$SERVICE_NAME" ]; then
            echo "❌ ECS cluster/service not found. Please run 'terraform apply' first."
            exit 1
        fi
        
        # Get Terraform region (where resources are actually deployed)
        TF_REGION=$(get_terraform_region)
        
        echo "Cluster: $CLUSTER_NAME"
        echo "Service: $SERVICE_NAME"
        echo "Region: $TF_REGION"
        
        if ! aws ecs update-service \
            --cluster "$CLUSTER_NAME" \
            --service "$SERVICE_NAME" \
            --force-new-deployment \
            --region "$TF_REGION"; then
            echo ""
            echo "❌ Failed to update ECS service!"
            exit 1
        fi
        
        echo ""
        echo "✅ Deployment triggered successfully!"
        echo "   Use './deploy.sh logs' to monitor deployment"
        ;;
        
    "logs")
        echo "Streaming logs..."
        cd "$SCRIPT_DIR"
        
        LOG_GROUP=$(terraform output -raw ecs_service_name 2>/dev/null | sed 's/.*\///')
        
        if [ -z "$LOG_GROUP" ]; then
            LOG_GROUP="/ecs/skyfi-mcp-production"
        fi
        
        # Get Terraform region (where resources are actually deployed)
        TF_REGION=$(get_terraform_region)
        
        echo "Log group: $LOG_GROUP"
        echo "Region: $TF_REGION"
        aws logs tail "$LOG_GROUP" --follow --region "$TF_REGION"
        ;;
        
    "status")
        echo "Checking deployment status..."
        cd "$SCRIPT_DIR"
        
        # Get outputs
        ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
        
        if [ -z "$ALB_DNS" ]; then
            echo "❌ Infrastructure not deployed yet."
            exit 1
        fi
        
        echo "======================================"
        echo "Deployment Status"
        echo "======================================"
        echo "ALB DNS: $ALB_DNS"
        echo ""
        
        # Test health endpoint
        echo "Testing health endpoint..."
        if curl -s -f "http://$ALB_DNS/health" > /dev/null 2>&1; then
            echo "✅ Application is healthy!"
            curl -s "http://$ALB_DNS/health" | jq '.' 2>/dev/null || curl -s "http://$ALB_DNS/health"
        else
            echo "❌ Application is not responding"
        fi
        ;;
        
    "destroy")
        echo "⚠️  WARNING: This will destroy ALL infrastructure!"
        echo "   This action cannot be undone."
        echo ""
        read -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM
        
        if [ "$CONFIRM" = "yes" ]; then
            cd "$SCRIPT_DIR"
            terraform destroy
            echo ""
            echo "✅ Infrastructure destroyed"
        else
            echo "Cancelled."
        fi
        ;;
        
    "all")
        echo "Running complete deployment..."
        echo ""
        
        # Step 1: Initialize
        echo "Step 1/4: Initializing Terraform..."
        cd "$SCRIPT_DIR"
        terraform init
        echo ""
        
        # Step 2: Apply infrastructure
        echo "Step 2/4: Deploying infrastructure..."
        if ! terraform apply; then
            echo ""
            echo "❌ Terraform apply failed! Stopping deployment."
            exit 1
        fi
        echo ""
        
        # Step 3: Build and push image
        echo "Step 3/4: Building and pushing Docker image..."
        bash "$SCRIPT_DIR/deploy.sh" build
        echo ""
        
        # Step 4: Deploy to ECS
        echo "Step 4/4: Deploying to ECS..."
        bash "$SCRIPT_DIR/deploy.sh" deploy
        echo ""
        
        echo "======================================"
        echo "✅ Deployment Complete!"
        echo "======================================"
        echo ""
        
        ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
        echo "Application URL: http://$ALB_DNS"
        echo ""
        echo "Useful commands:"
        echo "  ./deploy.sh status  - Check deployment status"
        echo "  ./deploy.sh logs    - View application logs"
        echo "  ./deploy.sh build   - Rebuild and push image"
        echo "  ./deploy.sh deploy  - Trigger new deployment"
        ;;
        
    *)
        echo "Usage: $0 {init|plan|apply|build|deploy|logs|status|destroy|all}"
        echo ""
        echo "Commands:"
        echo "  init    - Initialize Terraform"
        echo "  plan    - Plan infrastructure changes"
        echo "  apply   - Apply infrastructure changes"
        echo "  build   - Build and push Docker image"
        echo "  deploy  - Deploy application to ECS"
        echo "  logs    - Stream application logs"
        echo "  status  - Check deployment status"
        echo "  destroy - Destroy all infrastructure"
        echo "  all     - Complete deployment (default)"
        exit 1
        ;;
esac

