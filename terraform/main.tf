terraform {
  required_version = ">= 1.5.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Uncomment for remote state management
  # backend "s3" {
  #   bucket         = "skyfi-mcp-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "skyfi-mcp-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "skyfi-mcp"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
}

# Security Groups Module
module "security_groups" {
  source = "./modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# Secrets Module
module "secrets" {
  source = "./modules/secrets"

  project_name  = var.project_name
  environment   = var.environment
  skyfi_api_key = var.skyfi_api_key
  db_password   = var.db_password
}

# RDS Module
module "rds" {
  source = "./modules/rds"

  project_name           = var.project_name
  environment            = var.environment
  vpc_id                 = module.vpc.vpc_id
  private_subnet_ids     = module.vpc.private_subnet_ids
  security_group_ids     = [module.security_groups.rds_sg_id]
  db_name                = var.db_name
  db_username            = var.db_username
  db_password_secret_arn = module.secrets.db_password_secret_arn
  instance_class         = var.rds_instance_class
  allocated_storage      = var.rds_allocated_storage
  multi_az               = var.rds_multi_az
  backup_retention_days  = var.rds_backup_retention_days
}

# ElastiCache Module
module "elasticache" {
  source = "./modules/elasticache"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_ids = [module.security_groups.redis_sg_id]
  node_type          = var.redis_node_type
  num_cache_nodes    = var.redis_num_cache_nodes
  automatic_failover = var.redis_automatic_failover
}

# ECR Module
module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
  environment  = var.environment
}

# IAM Module
module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  account_id   = data.aws_caller_identity.current.account_id
  secrets_arns = module.secrets.all_secret_arns
}

# ALB Module
module "alb" {
  source = "./modules/alb"

  project_name        = var.project_name
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  security_group_ids  = [module.security_groups.alb_sg_id]
  ssl_certificate_arn = var.ssl_certificate_arn
  enable_https        = var.enable_https
}

# ECS Module
module "ecs" {
  source = "./modules/ecs"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_ids = [module.security_groups.ecs_sg_id]

  # Container configuration
  ecr_repository_url = module.ecr.repository_url
  container_port     = var.container_port
  container_cpu      = var.ecs_task_cpu
  container_memory   = var.ecs_task_memory

  # Environment variables
  db_host     = module.rds.db_endpoint
  db_port     = module.rds.db_port
  db_name     = var.db_name
  db_username = var.db_username
  redis_host  = module.elasticache.redis_endpoint
  redis_port  = module.elasticache.redis_port

  # Secrets
  skyfi_api_key_secret_arn = module.secrets.skyfi_api_key_secret_arn
  jwt_secret_arn           = module.secrets.jwt_secret_arn
  db_password_secret_arn   = module.secrets.db_password_secret_arn

  # IAM
  execution_role_arn = module.iam.ecs_task_execution_role_arn
  task_role_arn      = module.iam.ecs_task_role_arn

  # Service configuration
  desired_count    = var.ecs_desired_count
  target_group_arn = module.alb.target_group_arn

  # Auto-scaling
  enable_autoscaling = var.ecs_enable_autoscaling
  min_capacity       = var.ecs_min_capacity
  max_capacity       = var.ecs_max_capacity
  cpu_target_value   = var.ecs_cpu_target_value
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"

  project_name            = var.project_name
  environment             = var.environment
  ecs_cluster_name        = module.ecs.cluster_name
  ecs_service_name        = module.ecs.service_name
  alb_arn_suffix          = module.alb.alb_arn_suffix
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  alarm_email             = var.alarm_email
}

