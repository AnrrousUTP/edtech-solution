FROM localstack/localstack:3

# El repositorio puede estar montado desde Windows con CRLF. LocalStack
# ejecuta los scripts de ready.d directamente, por lo que normalizamos el
# shebang dentro de la imagen para que funcione igual en Docker y Podman.
COPY 01-crear-recursos.sh /etc/localstack/init/ready.d/01-crear-recursos.sh
RUN sed -i 's/\r$//' /etc/localstack/init/ready.d/01-crear-recursos.sh \
    && chmod +x /etc/localstack/init/ready.d/01-crear-recursos.sh
