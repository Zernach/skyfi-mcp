# Generate random JWT secret if not provided
resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

# Generate random database password if not provided
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# SkyFi API Key Secret
resource "aws_secretsmanager_secret" "skyfi_api_key" {
  name                    = "${var.project_name}/${var.environment}/skyfi-api-key"
  description             = "SkyFi API Key for ${var.project_name}"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-skyfi-api-key"
  }
}

resource "aws_secretsmanager_secret_version" "skyfi_api_key" {
  secret_id     = aws_secretsmanager_secret.skyfi_api_key.id
  secret_string = var.skyfi_api_key
}

# JWT Secret
resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}/${var.environment}/jwt-secret"
  description             = "JWT secret for ${var.project_name}"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-jwt-secret"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

# Database Password Secret
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project_name}/${var.environment}/db-password"
  description             = "PostgreSQL password for ${var.project_name}"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-db-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password != "" ? var.db_password : random_password.db_password.result
}

