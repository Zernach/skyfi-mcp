locals {
  random_secret_specs = {
    jwt_secret = {
      length  = 64
      special = true
    }
    db_password = {
      length  = 32
      special = true
    }
  }
}

resource "random_password" "generated" {
  for_each = local.random_secret_specs

  length  = each.value.length
  special = each.value.special
}

locals {
  secret_definitions = {
    skyfi_api_key = {
      name         = "${var.project_name}/${var.environment}/skyfi-api-key"
      description  = "SkyFi API Key for ${var.project_name}"
      secret_value = var.skyfi_api_key
      tag_suffix   = "skyfi-api-key"
    }
    jwt_secret = {
      name         = "${var.project_name}/${var.environment}/jwt-secret"
      description  = "JWT secret for ${var.project_name}"
      secret_value = random_password.generated["jwt_secret"].result
      tag_suffix   = "jwt-secret"
    }
    db_password = {
      name         = "${var.project_name}/${var.environment}/db-password"
      description  = "PostgreSQL password for ${var.project_name}"
      secret_value = length(trimspace(var.db_password)) > 0 ? var.db_password : random_password.generated["db_password"].result
      tag_suffix   = "db-password"
    }
  }
}

resource "aws_secretsmanager_secret" "secret" {
  for_each = local.secret_definitions

  name                    = each.value.name
  description             = each.value.description
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}-${var.environment}-${each.value.tag_suffix}"
  }

  lifecycle {
    prevent_destroy = false
  }
}

resource "aws_secretsmanager_secret_version" "secret" {
  for_each = local.secret_definitions

  secret_id     = aws_secretsmanager_secret.secret[each.key].id
  secret_string = sensitive(each.value.secret_value)
}

