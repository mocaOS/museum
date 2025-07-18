#!/bin/bash

# Check if a name parameter is provided
if [ -z "$1" ]; then
    echo "Error: Please provide a name for the migration"
    echo "Usage: ./create-migration.sh <migration-name>"
    exit 1
fi

# Create the migrations directory if it doesn't exist
mkdir -p migrations

# Generate timestamp
TIMESTAMP=$(date +%s)

# Slugify the name:
# 1. Convert to lowercase
# 2. Replace spaces and underscores with hyphens
# 3. Remove all characters except letters, numbers, and hyphens
# 4. Replace multiple consecutive hyphens with a single hyphen
# 5. Remove leading and trailing hyphens
SLUG=$(echo "$1" | tr '[:upper:]' '[:lower:]' | \
    tr ' _' '-' | \
    sed 's/[^a-z0-9-]//g' | \
    sed 's/-\+/-/g' | \
    sed 's/^-\|-$//g')

FILENAME="migrations/${TIMESTAMP}-${SLUG}.js"

# Create the migration file with the template
cat > "$FILENAME" << EOL
export async function up(knex) {
    // TODO
}

export async function down(knex) {
    // TODO
}
EOL

echo "Created migration file: $FILENAME"
