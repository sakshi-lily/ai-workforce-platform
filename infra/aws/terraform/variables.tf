variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "production"
}

variable "db_username" {
  description = "Master username for RDS MySQL"
  type        = string
  default     = "workforce_admin"
}

variable "db_password" {
  description = "Master password for RDS MySQL"
  type        = string
  sensitive   = true
  default     = "Password1234Secure!"
}

variable "api_image_uri" {
  description = "ECR image URI for API and Worker"
  type        = string
  default     = "123456789012.dkr.ecr.ap-south-1.amazonaws.com/ai-workforce-api:production"
}
