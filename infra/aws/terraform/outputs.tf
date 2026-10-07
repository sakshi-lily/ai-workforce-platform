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
