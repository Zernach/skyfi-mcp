#!/bin/bash

# Wait for AWS to release the ALB and Target Group names
# This script polls AWS until the resources are fully deleted

set -e

echo "🕐 Waiting for AWS to release resource names..."
echo ""

MAX_ATTEMPTS=60  # 10 minutes (60 * 10 seconds)
ATTEMPT=0

check_alb() {
    aws elbv2 describe-load-balancers --names skyfi-mcp-production-alb 2>&1 | grep -q "LoadBalancerNotFound"
    return $?
}

check_tg() {
    aws elbv2 describe-target-groups --names skyfi-mcp-production-tg 2>&1 | grep -q "not found"
    return $?
}

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo "Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    
    ALB_AVAILABLE=false
    TG_AVAILABLE=false
    
    if check_alb; then
        echo "  ✅ ALB name 'skyfi-mcp-production-alb' is available"
        ALB_AVAILABLE=true
    else
        echo "  ⏳ ALB name still reserved..."
    fi
    
    if check_tg; then
        echo "  ✅ Target Group name 'skyfi-mcp-production-tg' is available"
        TG_AVAILABLE=true
    else
        echo "  ⏳ Target Group name still reserved..."
    fi
    
    if [ "$ALB_AVAILABLE" = true ] && [ "$TG_AVAILABLE" = true ]; then
        echo ""
        echo "✅ All resource names are now available!"
        echo "You can now run: terraform apply"
        exit 0
    fi
    
    echo "  Waiting 10 seconds before next check..."
    echo ""
    sleep 10
done

echo "❌ Timeout waiting for resource names to be released after 10 minutes"
echo "Possible solutions:"
echo "  1. Wait longer and run this script again"
echo "  2. Change resource names in terraform/terraform.tfvars"
echo "  3. Check AWS console for stuck resources"
exit 1

