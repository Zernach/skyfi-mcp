#!/bin/bash
# Fix HTTPS/Certificate Setup Script

set -e

echo "=========================================="
echo "SSL/TLS Certificate Validation Guide"
echo "=========================================="
echo ""

# Get the certificate ARN and validation records
CERT_ARN="arn:aws:acm:us-east-1:971422717446:certificate/add3ff4d-48b8-420d-a6d8-d430ef554d2f"

echo "✅ Certificate already created: $CERT_ARN"
echo ""
echo "📋 Getting DNS validation records..."
echo ""

# Get validation records from AWS
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
  --output json

echo ""
echo "=========================================="
echo "NEXT STEPS:"
echo "=========================================="
echo ""
echo "1. Copy the DNS validation record above"
echo "2. Add this CNAME record to your DNS provider (archlife.org):"
echo "   - Type: CNAME"
echo "   - Name: [Copy 'Name' from above]"
echo "   - Value: [Copy 'Value' from above]"
echo "   - TTL: 300 (or default)"
echo ""
echo "3. Wait for certificate validation (5-30 minutes)"
echo "   Check status with:"
echo "   aws acm describe-certificate --certificate-arn $CERT_ARN --region us-east-1 --query 'Certificate.Status' --output text"
echo ""
echo "4. Once status is 'ISSUED', enable HTTPS:"
echo "   - Edit terraform.tfvars"
echo "   - Set: enable_https = true"
echo "   - Run: terraform apply"
echo ""
echo "5. Add your CNAME record for the domain:"
echo "   - Type: CNAME"
echo "   - Name: api.skyfi.archlife.org"
echo "   - Value: skyfi-mcp-prod-v2-alb-680967047.us-east-1.elb.amazonaws.com"
echo "   - TTL: 300"
echo ""
echo "=========================================="
echo ""

# Fix the current Terraform state
echo "🔧 Fixing Terraform state..."
echo ""

# Apply the fixed configuration
terraform apply -auto-approve

echo ""
echo "✅ Terraform state fixed!"
echo ""
echo "Your infrastructure is now running with HTTP only."
echo "Follow the steps above to enable HTTPS after certificate validation."
echo ""

