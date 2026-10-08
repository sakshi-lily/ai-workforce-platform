output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "rds_endpoint" {
  description = "Amazon RDS MySQL Endpoint"
  value       = aws_db_instance.mysql.endpoint
}

output "redis_endpoint" {
  description = "Amazon ElastiCache Redis Primary Endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "s3_bucket" {
  description = "S3 Artifacts Bucket Name"
  value       = aws_s3_bucket.artifacts.id
}

output "ecr_api_repository_url" {
  description = "ECR API Repository URL"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_worker_repository_url" {
  description = "ECR Worker Repository URL"
  value       = aws_ecr_repository.worker.repository_url
}

output "ecr_client_repository_url" {
  description = "ECR Client Repository URL"
  value       = aws_ecr_repository.client.repository_url
}

output "github_deploy_role_arn" {
  description = "GitHub Actions OIDC Deploy Role ARN"
  value       = aws_iam_role.github_actions_deploy.arn
}

