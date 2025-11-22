variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "skyfi-mcp"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# RDS Configuration
variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "skyfi_mcp"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "skyfi"
}

variable "db_password" {
  description = "PostgreSQL master password (leave empty to auto-generate)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.small"
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = true
}

variable "rds_backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

# ElastiCache Configuration
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.small"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 2
}

variable "redis_automatic_failover" {
  description = "Enable automatic failover"
  type        = bool
  default     = true
}

# ECS Configuration
variable "container_port" {
  description = "Container port for the application"
  type        = number
  default     = 3000
}

variable "ecs_task_cpu" {
  description = "Fargate task CPU units (256, 512, 1024, 2048, 4096)"
  type        = string
  default     = "512"
}

variable "ecs_task_memory" {
  description = "Fargate task memory in MB (512, 1024, 2048, 4096, 8192)"
  type        = string
  default     = "1024"
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "ecs_enable_autoscaling" {
  description = "Enable auto-scaling for ECS service"
  type        = bool
  default     = true
}

variable "ecs_min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 2
}

variable "ecs_max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
  default     = 10
}

variable "ecs_cpu_target_value" {
  description = "Target CPU utilization percentage for auto-scaling"
  type        = number
  default     = 70
}

# Secrets
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

# SSL/TLS Configuration
variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate from ACM (leave empty to use HTTP only)"
  type        = string
  default     = ""
}

variable "enable_https" {
  description = "Enable HTTPS listener on ALB"
  type        = bool
  default     = false
}

# Monitoring
variable "alarm_email" {
  description = "Email address for CloudWatch alarms"
  type        = string
  default     = ""
}

