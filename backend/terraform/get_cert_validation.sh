#!/bin/bash
# Get ACM Certificate DNS Validation Records

CERT_ARN="arn:aws:acm:us-east-1:971422717446:certificate/add3ff4d-48b8-420d-a6d8-d430ef554d2f"

echo "=========================================="
echo "ACM Certificate DNS Validation Records"
echo "=========================================="
echo ""
echo "Certificate ARN: $CERT_ARN"
echo ""

# Check certificate status
STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.Status' \
  --output text)

echo "Current Status: $STATUS"
echo ""

if [ "$STATUS" = "ISSUED" ]; then
  echo "✅ Certificate is already validated and issued!"
  echo ""
  echo "You can now enable HTTPS:"
  echo "1. Edit terraform.tfvars and set: enable_https = true"
  echo "2. Run: terraform apply"
  exit 0
fi

echo "📋 DNS Validation Record Required:"
echo ""

# Get validation record
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
  --output table

echo ""
echo "=========================================="
echo "ADD THIS CNAME RECORD TO YOUR DNS:"
echo "=========================================="
echo ""

NAME=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Name' \
  --output text)

VALUE=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Value' \
  --output text)

echo "Type:  CNAME"
echo "Name:  $NAME"
echo "Value: $VALUE"
echo "TTL:   300"
echo ""
echo "After adding this record, validation typically takes 5-30 minutes."
echo "Check status again by running this script."
echo ""

