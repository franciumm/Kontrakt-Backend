#!/bin/bash
set -e

BASE_URL="https://kontrakt.fly.dev"
EMAIL="postman_tester_$(date +%s)@example.com"
PASSWORD="password123"
PDF_PATH="/Users/francium/Desktop/HPARC-software-development-agreement-2.pdf"

echo "[1] Registering user..."
REGISTER_RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Postman Tester\", \"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")
HTTP_CODE=$(echo "$REGISTER_RES" | tail -n1)
BODY=$(echo "$REGISTER_RES" | sed '$ d')

if [ "$HTTP_CODE" -ne 201 ]; then
  echo "Registration failed with $HTTP_CODE: $BODY"
  exit 1
fi
echo "Registration Body: $BODY"
TOKEN=$(echo $BODY | jq -r '.data.accessToken')
echo "✅ Token acquired: ${TOKEN:0:15}..."

echo "\n[2] Uploading PDF for extraction..."
EXTRACT_RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/audit/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "contractFile=@$PDF_PATH")
HTTP_CODE=$(echo "$EXTRACT_RES" | tail -n1)
BODY=$(echo "$EXTRACT_RES" | sed '$ d')

if [ "$HTTP_CODE" -ne 202 ]; then
  echo "Extraction trigger failed with $HTTP_CODE: $BODY"
  exit 1
fi
echo "Extract Response: $BODY"
EXTRACT_JOB_ID=$(echo $BODY | jq -r '.jobId')
echo "✅ Extract Job ID: $EXTRACT_JOB_ID"

echo "\n[3] Polling extraction job..."
while true; do
  JOB_RES=$(curl -s "$BASE_URL/api/jobs/$EXTRACT_JOB_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  STATE=$(echo $JOB_RES | jq -r '.data.state')
  echo "Job state: $STATE"
  if [ "$STATE" = "completed" ]; then
    echo "✅ Extraction Job completed!"
    EXTRACT_TOKEN=$(echo $JOB_RES | jq -r '.data.result.extractToken')
    TEXT_PREVIEW=$(echo $JOB_RES | jq -r '.data.result.text' | cut -c1-100)
    echo "Extracted Text Preview: $TEXT_PREVIEW..."
    break
  elif [ "$STATE" = "failed" ]; then
    echo "❌ Extraction Job failed!"
    echo $JOB_RES | jq .
    exit 1
  fi
  sleep 3
done

echo "\n[4] Starting deep analysis..."
# Need to send JSON with the extracted text, but we don't need to send the whole text if extractToken is used?
# Wait, the e2e test sends contractText: extractResult.text
TEXT=$(echo $JOB_RES | jq -r '.data.result.text')
# To safely send text in curl, use jq to build the JSON
JSON_PAYLOAD=$(jq -n --arg text "$TEXT" '{contractText: $text}')

ANALYZE_RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/audit/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Extract-Token: $EXTRACT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")
HTTP_CODE=$(echo "$ANALYZE_RES" | tail -n1)
BODY=$(echo "$ANALYZE_RES" | sed '$ d')

if [ "$HTTP_CODE" -ne 202 ]; then
  echo "Analyze trigger failed with $HTTP_CODE: $BODY"
  exit 1
fi
echo "Analyze Response: $BODY"
ANALYZE_JOB_ID=$(echo $BODY | jq -r '.jobId')

echo "\n[5] Polling analyze job..."
while true; do
  JOB_RES=$(curl -s "$BASE_URL/api/jobs/$ANALYZE_JOB_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  STATE=$(echo $JOB_RES | jq -r '.data.state')
  echo "Job state: $STATE"
  if [ "$STATE" = "completed" ]; then
    echo "✅ Analyze Job completed!"
    echo $JOB_RES | jq .data.result
    break
  elif [ "$STATE" = "failed" ]; then
    echo "❌ Analyze Job failed!"
    echo $JOB_RES | jq .
    exit 1
  fi
  sleep 3
done

echo "\n[6] Fetching submission history..."
HISTORY_RES=$(curl -s "$BASE_URL/api/audit/history" \
  -H "Authorization: Bearer $TOKEN")
echo "History Response:"
echo $HISTORY_RES | jq '{pagination: .pagination, first_item_id: .data[0]._id, first_item_flags_count: .data[0].flags | length}'

echo "\n✅ All E2E CURL tests passed!"
