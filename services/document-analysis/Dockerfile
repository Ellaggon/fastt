FROM clamav/clamav:stable@sha256:bda39705e291105049c3936e2803ac90b955172af8030f94f05dce1252df6c6d
USER root
RUN apk add --no-cache nodejs qpdf poppler-utils font-dejavu fontconfig tesseract-ocr tesseract-ocr-data-spa tesseract-ocr-data-eng
WORKDIR /app
COPY analyze.mjs server.mjs start.sh /app/
RUN chmod 755 /app/start.sh
USER clamav
ENV PORT=4319 GATEWAY_BIND_ADDRESS=0.0.0.0 XDG_CACHE_HOME=/tmp/font-cache HOME=/tmp
EXPOSE 4319
ENTRYPOINT ["/app/start.sh"]
