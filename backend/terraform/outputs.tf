output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer (for Route53)"
  value       = module.alb.alb_zone_id
}

output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = module.ecr.repository_url
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "rds_database_name" {
  description = "RDS database name"
  value       = var.db_name
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.elasticache.redis_endpoint
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = module.ecs.service_name
}

output "ecs_log_group_name" {
  description = "Name of the CloudWatch log group for ECS"
  value       = module.ecs.log_group_name
}

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnet_ids
}

output "deployment_instructions" {
  description = "Instructions for deploying the application"
  value       = <<-EOT
    
    ====================================
    SkyFi MCP Deployment Complete!
    ====================================
    
    1. Build and push your Docker image:
       
       aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${module.ecr.repository_url}
       docker build -t skyfi-mcp .
       docker tag skyfi-mcp:latest ${module.ecr.repository_url}:latest
       docker push ${module.ecr.repository_url}:latest
    
    2. Force new ECS deployment:
       
       aws ecs update-service --cluster ${module.ecs.cluster_name} --service ${module.ecs.service_name} --force-new-deployment --region ${var.aws_region}
    
    3. Access your application:
       
       http://${module.alb.alb_dns_name}/health
    
    4. Monitor logs:
       
       aws logs tail /ecs/${var.project_name}-${var.environment} --follow --region ${var.aws_region}
    
    ====================================
  EOT
}

