output "alb_sg_id" {
  description = "ID of ALB security group"
  value       = aws_security_group.alb.id
}

output "ecs_sg_id" {
  description = "ID of ECS security group"
  value       = aws_security_group.ecs.id
}

output "rds_sg_id" {
  description = "ID of RDS security group"
  value       = aws_security_group.rds.id
}

output "redis_sg_id" {
  description = "ID of Redis security group"
  value       = aws_security_group.redis.id
}

