#!/bin/bash
# GENERADO por tools/gen-localstack-init.ts desde tools/eventos.json — NO editar a mano.
set -euo pipefail

awslocal events create-event-bus --name edtech-domain-events 2>/dev/null || true

awslocal sqs create-queue --queue-name edtech-dev-identity-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-identity --attributes '{"VisibilityTimeout":"180","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-identity-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name edtech-dev-enrollment-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-enrollment --attributes '{"VisibilityTimeout":"180","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-enrollment-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name edtech-dev-gamification-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-gamification --attributes '{"VisibilityTimeout":"180","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-gamification-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name edtech-dev-flashcards-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-flashcards --attributes '{"VisibilityTimeout":"600","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-flashcards-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name edtech-dev-payments-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-payments --attributes '{"VisibilityTimeout":"180","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-payments-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name edtech-dev-notifications-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-notifications --attributes '{"VisibilityTimeout":"180","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-notifications-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name edtech-dev-payments-webhooks-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-payments-webhooks --attributes '{"VisibilityTimeout":"180","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-payments-webhooks-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name edtech-dev-gamification-certificados-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-gamification-certificados --attributes '{"VisibilityTimeout":"180","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-gamification-certificados-dlq\",\"maxReceiveCount\":\"5\"}"}'
awslocal sqs create-queue --queue-name edtech-dev-flashcards-generacion-dlq --attributes MessageRetentionPeriod=1209600
awslocal sqs create-queue --queue-name edtech-dev-flashcards-generacion --attributes '{"VisibilityTimeout":"600","MessageRetentionPeriod":"345600","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:edtech-dev-flashcards-generacion-dlq\",\"maxReceiveCount\":\"5\"}"}'

awslocal events put-rule --event-bus-name edtech-domain-events --name edtech-dev-enrollment-desde-payments \
  --event-pattern '{"detail-type":["payments.pago-confirmado.v1","payments.pago-reembolsado.v1"]}'
awslocal events put-targets --event-bus-name edtech-domain-events --rule edtech-dev-enrollment-desde-payments \
  --targets 'Id=1,Arn=arn:aws:sqs:us-east-1:000000000000:edtech-dev-enrollment'

awslocal events put-rule --event-bus-name edtech-domain-events --name edtech-dev-enrollment-desde-catalog \
  --event-pattern '{"detail-type":["catalog.curso-publicado.v1","catalog.curso-despublicado.v1","catalog.contenido-actualizado.v1"]}'
awslocal events put-targets --event-bus-name edtech-domain-events --rule edtech-dev-enrollment-desde-catalog \
  --targets 'Id=1,Arn=arn:aws:sqs:us-east-1:000000000000:edtech-dev-enrollment'

awslocal events put-rule --event-bus-name edtech-domain-events --name edtech-dev-gamification-desde-enrollment \
  --event-pattern '{"detail-type":["enrollment.leccion-completada.v1","enrollment.tomo-completado.v1","enrollment.curso-completado.v1","enrollment.carrera-completada.v1","enrollment.evaluacion-aprobada.v1"]}'
awslocal events put-targets --event-bus-name edtech-domain-events --rule edtech-dev-gamification-desde-enrollment \
  --targets 'Id=1,Arn=arn:aws:sqs:us-east-1:000000000000:edtech-dev-gamification'

awslocal events put-rule --event-bus-name edtech-domain-events --name edtech-dev-gamification-desde-identity \
  --event-pattern '{"detail-type":["identity.usuario-registrado.v1"]}'
awslocal events put-targets --event-bus-name edtech-domain-events --rule edtech-dev-gamification-desde-identity \
  --targets 'Id=1,Arn=arn:aws:sqs:us-east-1:000000000000:edtech-dev-gamification'

awslocal events put-rule --event-bus-name edtech-domain-events --name edtech-dev-flashcards-desde-catalog \
  --event-pattern '{"detail-type":["catalog.contenido-actualizado.v1"]}'
awslocal events put-targets --event-bus-name edtech-domain-events --rule edtech-dev-flashcards-desde-catalog \
  --targets 'Id=1,Arn=arn:aws:sqs:us-east-1:000000000000:edtech-dev-flashcards'

awslocal events put-rule --event-bus-name edtech-domain-events --name edtech-dev-identity-desde-enrollment \
  --event-pattern '{"detail-type":["enrollment.curso-completado.v1","enrollment.test-nivelacion-completado.v1"]}'
awslocal events put-targets --event-bus-name edtech-domain-events --rule edtech-dev-identity-desde-enrollment \
  --targets 'Id=1,Arn=arn:aws:sqs:us-east-1:000000000000:edtech-dev-identity'

awslocal events put-rule --event-bus-name edtech-domain-events --name edtech-dev-payments-desde-catalog \
  --event-pattern '{"detail-type":["catalog.curso-publicado.v1","catalog.precio-actualizado.v1","catalog.curso-despublicado.v1"]}'
awslocal events put-targets --event-bus-name edtech-domain-events --rule edtech-dev-payments-desde-catalog \
  --targets 'Id=1,Arn=arn:aws:sqs:us-east-1:000000000000:edtech-dev-payments'

awslocal events put-rule --event-bus-name edtech-domain-events --name edtech-dev-notificaciones \
  --event-pattern '{"detail-type":[{"prefix":"identity."},{"prefix":"enrollment."},{"prefix":"gamification."},{"prefix":"payments."},{"prefix":"flashcards."}]}'
awslocal events put-targets --event-bus-name edtech-domain-events --rule edtech-dev-notificaciones \
  --targets 'Id=1,Arn=arn:aws:sqs:us-east-1:000000000000:edtech-dev-notifications'

awslocal s3 mb s3://edtech-dev-media 2>/dev/null || true

# Secreto de PayPal con valores dummy: el flujo real de pagos se prueba contra AWS dev (F8).
awslocal secretsmanager create-secret --name edtech/dev/paypal --secret-string '{"env":"sandbox","clientId":"dummy-local","clientSecret":"dummy-local","webhookId":"dummy-local"}' 2>/dev/null || true

echo "[localstack-init] recursos creados"
