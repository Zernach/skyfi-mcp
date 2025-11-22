variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "skyfi_api_key" {
  description = "SkyFi API key"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_password" {
  description = "Database password (leave empty to auto-generate)"
  type        = string
  default     = ""
  sensitive   = true
}

