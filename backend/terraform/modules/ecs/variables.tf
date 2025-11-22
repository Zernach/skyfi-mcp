variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "ecr_repository_url" {
  description = "URL of the ECR repository"
  type        = string
}

variable "container_port" {
  description = "Container port"
  type        = number
}

variable "container_cpu" {
  description = "Container CPU units"
  type        = string
}

variable "container_memory" {
  description = "Container memory in MB"
  type        = string
}

variable "db_host" {
  description = "Database host"
  type        = string
}

variable "db_port" {
  description = "Database port"
  type        = number
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "db_username" {
  description = "Database username"
  type        = string
}

variable "redis_host" {
  description = "Redis host"
  type        = string
}

variable "redis_port" {
  description = "Redis port"
  type        = number
}

variable "skyfi_api_key_secret_arn" {
  description = "ARN of SkyFi API key secret"
  type        = string
}

variable "openai_api_key_secret_arn" {
  description = "ARN of OpenAI API key secret"
  type        = string
}

variable "jwt_secret_arn" {
  description = "ARN of JWT secret"
  type        = string
}

variable "db_password_secret_arn" {
  description = "ARN of database password secret"
  type        = string
}

variable "execution_role_arn" {
  description = "ARN of ECS task execution role"
  type        = string
}

variable "task_role_arn" {
  description = "ARN of ECS task role"
  type        = string
}

variable "desired_count" {
  description = "Desired number of tasks"
  type        = number
}

variable "target_group_arn" {
  description = "ARN of the target group"
  type        = string
}

variable "enable_autoscaling" {
  description = "Enable auto-scaling"
  type        = bool
  default     = true
}

variable "min_capacity" {
  description = "Minimum number of tasks"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum number of tasks"
  type        = number
  default     = 10
}

variable "cpu_target_value" {
  description = "Target CPU utilization percentage"
  type        = number
  default     = 70
}

