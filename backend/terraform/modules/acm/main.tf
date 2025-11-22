# ACM Certificate for Custom Domain
resource "aws_acm_certificate" "main" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  tags = {
    Name        = "${var.project_name}-${var.environment}-cert"
    Domain      = var.domain_name
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation records (output these for manual configuration)
# Note: If using Route53, you can automate validation with aws_acm_certificate_validation
# For now, we'll output the records for manual DNS configuration


