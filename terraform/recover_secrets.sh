#!/bin/bash

# Ensure Secrets Manager secrets are active and imported into Terraform state.
# Cancels pending deletions so that Terraform remains idempotent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

parse_tfvar() {
  local key="$1"

  if [ ! -f "terraform.tfvars" ]; then
    return
  fi

  awk -F= -v lookup_key="$key" '
    $0 ~ "^[[:space:]]*"lookup_key"[[:space:]]*=" {
      value = $2
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      gsub(/"/, "", value)
      print value
      exit
    }
  ' terraform.tfvars
}

PROJECT_NAME="${1:-$(parse_tfvar "project_name")}"
ENVIRONMENT="${2:-$(parse_tfvar "environment")}"

PROJECT_NAME="${PROJECT_NAME:-skyfi-mcp}"
ENVIRONMENT="${ENVIRONMENT:-prod}"

if ! command -v aws >/dev/null 2>&1; then
  echo "❌ AWS CLI not found. Install the AWS CLI to reconcile secrets." >&2
  exit 1
fi

echo "🔍 Reconciling secrets for ${PROJECT_NAME}/${ENVIRONMENT}..."

secret_keys=("skyfi_api_key" "jwt_secret" "db_password")

secret_suffix() {
  case "$1" in
    skyfi_api_key) echo "skyfi-api-key" ;;
    jwt_secret) echo "jwt-secret" ;;
    db_password) echo "db-password" ;;
    *) echo "$1" ;;
  esac
}

for key in "${secret_keys[@]}"; do
  suffix="$(secret_suffix "$key")"
  secret_name="${PROJECT_NAME}/${ENVIRONMENT}/${suffix}"

  echo "Checking secret: ${secret_name}"

  describe_output="$(aws secretsmanager describe-secret --secret-id "${secret_name}" --query "DeletionDate" --output text 2>&1 || true)"

  if [[ "$describe_output" == *"ResourceNotFoundException"* ]]; then
    echo "  ℹ️  Secret does not exist (Terraform will create it)"
    echo ""
    continue
  fi

  if [[ "$describe_output" == "None" || -z "$describe_output" || "$describe_output" == "null" ]]; then
    echo "  ✓ Secret exists and is active"
  else
    echo "  ⚠️  Secret scheduled for deletion on: $describe_output"
    echo "  🔄 Restoring secret..."
    aws secretsmanager restore-secret --secret-id "$secret_name" >/dev/null
    aws secretsmanager wait secret-exists --secret-id "$secret_name"
    echo "  ✅ Secret restored"
  fi

  echo ""
done

if command -v terraform >/dev/null 2>&1; then
  if [ -d ".terraform" ]; then
    echo "🔗 Ensuring Terraform state tracks existing secrets..."
    for key in "${secret_keys[@]}"; do
      suffix="$(secret_suffix "$key")"
      secret_name="${PROJECT_NAME}/${ENVIRONMENT}/${suffix}"
      resource_address="module.secrets.aws_secretsmanager_secret.secret[\"${key}\"]"

      if terraform state show "$resource_address" >/dev/null 2>&1; then
        echo "  ✓ ${resource_address} already managed"
        continue
      fi

      if aws secretsmanager describe-secret --secret-id "$secret_name" --query "ARN" --output text >/dev/null 2>&1; then
        echo "  → Importing ${resource_address}"
        terraform import "$resource_address" "$secret_name" >/dev/null
        echo "  ✅ Imported ${resource_address}"
      else
        echo "  ℹ️  Skipping import for ${resource_address} (secret not found)"
      fi
    done
  else
    echo "ℹ️  Terraform not initialized yet (.terraform directory missing); skipping state import."
  fi
else
  echo "ℹ️  Terraform CLI not available; skipping state import."
fi

echo "✅ Secret reconciliation complete!"

