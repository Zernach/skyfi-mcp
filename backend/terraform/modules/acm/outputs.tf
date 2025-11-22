output "certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = aws_acm_certificate.main.arn
}

output "certificate_id" {
  description = "ID of the ACM certificate"
  value       = aws_acm_certificate.main.id
}

output "certificate_status" {
  description = "Status of the ACM certificate"
  value       = aws_acm_certificate.main.status
}

output "domain_validation_options" {
  description = "DNS records needed for domain validation"
  value       = aws_acm_certificate.main.domain_validation_options
  sensitive   = false
}

