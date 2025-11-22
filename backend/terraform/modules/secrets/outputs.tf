output "skyfi_api_key_secret_arn" {
  description = "ARN of SkyFi API key secret"
  value       = aws_secretsmanager_secret.secret["skyfi_api_key"].arn
}

output "openai_api_key_secret_arn" {
  description = "ARN of OpenAI API key secret"
  value       = aws_secretsmanager_secret.secret["openai_api_key"].arn
}

output "jwt_secret_arn" {
  description = "ARN of JWT secret"
  value       = aws_secretsmanager_secret.secret["jwt_secret"].arn
}

output "db_password_secret_arn" {
  description = "ARN of database password secret"
  value       = aws_secretsmanager_secret.secret["db_password"].arn
}

output "all_secret_arns" {
  description = "List of all secret ARNs"
  value       = [for _, secret in aws_secretsmanager_secret.secret : secret.arn]
}


